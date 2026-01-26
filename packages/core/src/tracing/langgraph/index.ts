import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import {
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_PIPELINE_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { truncateGenAiMessages } from '../ai/messageTruncation';
import { extractSystemInstructions } from '../ai/utils';
import type { LangChainMessage } from '../langchain/types';
import { normalizeLangChainMessages } from '../langchain/utils';
import { startSpan } from '../trace';
import { LANGGRAPH_ORIGIN } from './constants';
import type { CompiledGraph, LangGraphOptions } from './types';
import { extractToolsFromCompiledGraph, setResponseAttributes } from './utils';

/**
 * Instruments StateGraph's compile method to create spans for agent creation and invocation
 *
 * Wraps the compile() method to:
 * - Create a `gen_ai.create_agent` span when compile() is called
 * - Automatically wrap the invoke() method on the returned compiled graph with a `gen_ai.invoke_agent` span
 *
 */
export function instrumentStateGraphCompile(
  originalCompile: (...args: unknown[]) => CompiledGraph,
  options: LangGraphOptions,
): (...args: unknown[]) => CompiledGraph {
  return new Proxy(originalCompile, {
    apply(target, thisArg, args: unknown[]): CompiledGraph {
      return startSpan(
        {
          op: 'gen_ai.create_agent',
          name: 'create_agent',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGGRAPH_ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.create_agent',
            [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'create_agent',
          },
        },
        span => {
          try {
            const compiledGraph = Reflect.apply(target, thisArg, args);
            const compileOptions = args.length > 0 ? (args[0] as Record<string, unknown>) : {};

            // Extract graph name
            if (compileOptions?.name && typeof compileOptions.name === 'string') {
              span.setAttribute(GEN_AI_AGENT_NAME_ATTRIBUTE, compileOptions.name);
              span.updateName(`create_agent ${compileOptions.name}`);
            }

            // Instrument agent invoke method on the compiled graph
            const originalInvoke = compiledGraph.invoke;
            if (originalInvoke && typeof originalInvoke === 'function') {
              compiledGraph.invoke = instrumentCompiledGraphInvoke(
                originalInvoke.bind(compiledGraph) as (...args: unknown[]) => Promise<unknown>,
                compiledGraph,
                compileOptions,
                options,
              ) as typeof originalInvoke;
            }

            return compiledGraph;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.ai.langgraph.error',
              },
            });
            throw error;
          }
        },
      );
    },
  }) as (...args: unknown[]) => CompiledGraph;
}

/**
 * Instruments CompiledGraph's invoke method to create spans for agent invocation
 *
 * Creates a `gen_ai.invoke_agent` span when invoke() is called
 */
function instrumentCompiledGraphInvoke(
  originalInvoke: (...args: unknown[]) => Promise<unknown>,
  graphInstance: CompiledGraph,
  compileOptions: Record<string, unknown>,
  options: LangGraphOptions,
): (...args: unknown[]) => Promise<unknown> {
  return new Proxy(originalInvoke, {
    apply(target, thisArg, args: unknown[]): Promise<unknown> {
      return startSpan(
        {
          op: 'gen_ai.invoke_agent',
          name: 'invoke_agent',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGGRAPH_ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE,
            [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          },
        },
        async span => {
          try {
            const graphName = compileOptions?.name;

            if (graphName && typeof graphName === 'string') {
              span.setAttribute(GEN_AI_PIPELINE_NAME_ATTRIBUTE, graphName);
              span.setAttribute(GEN_AI_AGENT_NAME_ATTRIBUTE, graphName);
              span.updateName(`invoke_agent ${graphName}`);
            }

            // Extract thread_id from the config (second argument)
            // LangGraph uses config.configurable.thread_id for conversation/session linking
            const config = args.length > 1 ? (args[1] as Record<string, unknown> | undefined) : undefined;
            const configurable = config?.configurable as Record<string, unknown> | undefined;
            const threadId = configurable?.thread_id;
            if (threadId && typeof threadId === 'string') {
              span.setAttribute(GEN_AI_CONVERSATION_ID_ATTRIBUTE, threadId);
            }

            // Extract available tools from the graph instance
            const tools = extractToolsFromCompiledGraph(graphInstance);
            if (tools) {
              span.setAttribute(GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE, JSON.stringify(tools));
            }

            // Parse input messages
            const recordInputs = options.recordInputs;
            const recordOutputs = options.recordOutputs;
            const inputMessages =
              args.length > 0 ? ((args[0] as { messages?: LangChainMessage[] }).messages ?? []) : [];

            if (inputMessages && recordInputs) {
              const normalizedMessages = normalizeLangChainMessages(inputMessages);
              const { systemInstructions, filteredMessages } = extractSystemInstructions(normalizedMessages);

              if (systemInstructions) {
                span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE, systemInstructions);
              }

              const truncatedMessages = truncateGenAiMessages(filteredMessages as unknown[]);
              const filteredLength = Array.isArray(filteredMessages) ? filteredMessages.length : 0;
              span.setAttributes({
                [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: JSON.stringify(truncatedMessages),
                [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: filteredLength,
              });
            }

            // Call original invoke
            const result = await Reflect.apply(target, thisArg, args);

            // Set response attributes
            if (recordOutputs) {
              setResponseAttributes(span, inputMessages ?? null, result);
            }

            return result;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.ai.langgraph.error',
              },
            });
            throw error;
          }
        },
      );
    },
  }) as (...args: unknown[]) => Promise<unknown>;
}

/**
 * Directly instruments a StateGraph instance to add tracing spans
 *
 * This function can be used to manually instrument LangGraph StateGraph instances
 * in environments where automatic instrumentation is not available or desired.
 *
 * @param stateGraph - The StateGraph instance to instrument
 * @param options - Optional configuration for recording inputs/outputs
 *
 * @example
 * ```typescript
 * import { instrumentLangGraph } from '@sentry/cloudflare';
 * import { StateGraph } from '@langchain/langgraph';
 *
 * const graph = new StateGraph(MessagesAnnotation)
 *   .addNode('agent', mockLlm)
 *   .addEdge(START, 'agent')
 *   .addEdge('agent', END);
 *
 * instrumentLangGraph(graph, { recordInputs: true, recordOutputs: true });
 * const compiled = graph.compile({ name: 'my_agent' });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentLangGraph<T extends { compile: (...args: any[]) => any }>(
  stateGraph: T,
  options?: LangGraphOptions,
): T {
  const _options: LangGraphOptions = options || {};

  stateGraph.compile = instrumentStateGraphCompile(stateGraph.compile.bind(stateGraph), _options);

  return stateGraph;
}
