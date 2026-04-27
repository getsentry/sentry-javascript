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
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import {
  extractSystemInstructions,
  getJsonString,
  getTruncatedJsonString,
  resolveAIRecordingOptions,
  shouldEnableTruncation,
} from '../ai/utils';
import { createLangChainCallbackHandler } from '../langchain';
import type { BaseChatModel, LangChainMessage } from '../langchain/types';
import { normalizeLangChainMessages } from '../langchain/utils';
import { startSpan } from '../trace';
import { LANGGRAPH_ORIGIN } from './constants';
import type { CompiledGraph, LangGraphOptions } from './types';
import {
  extractAgentNameFromParams,
  extractLLMFromParams,
  extractToolsFromCompiledGraph,
  setResponseAttributes,
  wrapToolsWithSpans,
} from './utils';

let _insideCreateReactAgent = false;

const SENTRY_PATCHED = '__sentry_patched__';

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
  if (Object.prototype.hasOwnProperty.call(originalCompile, SENTRY_PATCHED)) {
    return originalCompile;
  }

  const wrapped = new Proxy(originalCompile, {
    apply(target, thisArg, args: unknown[]): CompiledGraph {
      // Skip when called from within createReactAgent to avoid duplicate instrumentation
      if (_insideCreateReactAgent) {
        return Reflect.apply(target, thisArg, args);
      }

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

  Object.defineProperty(wrapped, SENTRY_PATCHED, { value: true, enumerable: false });
  return wrapped;
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
  llm?: BaseChatModel | null,
  sentryCallbackHandler?: unknown,
): (...args: unknown[]) => Promise<unknown> {
  return new Proxy(originalInvoke, {
    apply(target, thisArg, args: unknown[]): Promise<unknown> {
      const modelName = llm?.modelName;
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

            if (modelName) {
              span.setAttribute(GEN_AI_REQUEST_MODEL_ATTRIBUTE, modelName);
            }

            // Extract thread_id from the config (second argument)
            // LangGraph uses config.configurable.thread_id for conversation/session linking
            const config = args.length > 1 ? (args[1] as Record<string, unknown> | undefined) : undefined;
            const configurable = config?.configurable as Record<string, unknown> | undefined;
            const threadId = configurable?.thread_id;
            if (threadId && typeof threadId === 'string') {
              span.setAttribute(GEN_AI_CONVERSATION_ID_ATTRIBUTE, threadId);
            }

            // Inject callback handler and agent name into invoke config
            if (sentryCallbackHandler) {
              const invokeConfig = (args[1] ?? {}) as Record<string, unknown>;
              args[1] = invokeConfig;

              const existingMetadata = (invokeConfig.metadata ?? {}) as Record<string, unknown>;
              invokeConfig.metadata = {
                ...existingMetadata,
                __sentry_langgraph__: true,
                ...(typeof graphName === 'string' ? { lc_agent_name: graphName } : {}),
              };

              const existingCallbacks = invokeConfig.callbacks as unknown[] | undefined;
              if (!existingCallbacks) {
                invokeConfig.callbacks = [sentryCallbackHandler];
              } else if (Array.isArray(existingCallbacks) && !existingCallbacks.includes(sentryCallbackHandler)) {
                invokeConfig.callbacks = [...existingCallbacks, sentryCallbackHandler];
              }
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
              args.length > 0 ? ((args[0] as { messages?: LangChainMessage[] } | null)?.messages ?? []) : [];

            if (inputMessages && recordInputs) {
              const normalizedMessages = normalizeLangChainMessages(inputMessages);
              const { systemInstructions, filteredMessages } = extractSystemInstructions(normalizedMessages);

              if (systemInstructions) {
                span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE, systemInstructions);
              }

              const enableTruncation = shouldEnableTruncation(options.enableTruncation);
              const filteredLength = Array.isArray(filteredMessages) ? filteredMessages.length : 0;
              span.setAttributes({
                [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: enableTruncation
                  ? getTruncatedJsonString(filteredMessages)
                  : getJsonString(filteredMessages),
                [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: filteredLength,
              });
            }

            // Call original invoke
            const result = await Reflect.apply(target, thisArg, args);

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
 * Instruments createReactAgent to create invoke_agent and execute_tool spans.
 */
export function instrumentCreateReactAgent(
  originalCreateReactAgent: (...args: unknown[]) => CompiledGraph,
  options?: LangGraphOptions,
): (...args: unknown[]) => CompiledGraph {
  if (Object.prototype.hasOwnProperty.call(originalCreateReactAgent, SENTRY_PATCHED)) {
    return originalCreateReactAgent;
  }

  const resolvedOptions = resolveAIRecordingOptions(options);
  const sentryHandler = createLangChainCallbackHandler(resolvedOptions);

  const wrapped = new Proxy(originalCreateReactAgent, {
    apply(target, thisArg, args: unknown[]): CompiledGraph {
      const llm = extractLLMFromParams(args);
      const agentName = extractAgentNameFromParams(args);

      // Wrap tools with execute_tool spans (direct access gives us name, type, description)
      const params = args[0] as Record<string, unknown> | undefined;
      if (params && Array.isArray(params.tools) && params.tools.length > 0) {
        wrapToolsWithSpans(params.tools, resolvedOptions, agentName ?? undefined);
      }

      // Suppress StateGraph.compile instrumentation inside createReactAgent
      _insideCreateReactAgent = true;
      let compiledGraph: CompiledGraph;
      try {
        compiledGraph = Reflect.apply(target, thisArg, args);
      } finally {
        _insideCreateReactAgent = false;
      }

      // Wrap invoke() on the returned compiled graph
      const originalInvoke = compiledGraph.invoke;
      if (originalInvoke && typeof originalInvoke === 'function') {
        const compileOptions: Record<string, unknown> = {};
        if (agentName) {
          compileOptions.name = agentName;
        }

        compiledGraph.invoke = instrumentCompiledGraphInvoke(
          originalInvoke.bind(compiledGraph) as (...args: unknown[]) => Promise<unknown>,
          compiledGraph,
          compileOptions,
          resolvedOptions,
          llm,
          sentryHandler,
        ) as typeof originalInvoke;
      }

      return compiledGraph;
    },
  }) as (...args: unknown[]) => CompiledGraph;

  Object.defineProperty(wrapped, SENTRY_PATCHED, { value: true, enumerable: false });
  return wrapped;
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
  stateGraph.compile = instrumentStateGraphCompile(stateGraph.compile, resolveAIRecordingOptions(options));

  return stateGraph;
}
