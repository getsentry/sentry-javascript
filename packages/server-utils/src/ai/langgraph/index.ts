/* eslint-disable typescript-eslint/no-deprecated */
import {
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startSpan,
  startSpanManual,
  stringify,
} from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { extractSystemInstructions, resolveAIRecordingOptions } from '../core/utils';
import { createLangChainCallbackHandler } from '../langchain';
import type { BaseChatModel, LangChainMessage } from '../langchain/types';
import { _INTERNAL_mergeLangChainCallbackHandler, normalizeLangChainMessages } from '../langchain/utils';
import { LANGGRAPH_ORIGIN } from './constants';
import { getGraphInstrumentationId, instrumentStreamResult, isAsyncIterable } from './streaming';
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
const LANGGRAPH_INVOKE_ACTIVE = 'sentry_langgraph_invoke_active';

/**
 * Instruments StateGraph's compile method to wrap the returned compiled graph's invoke() and stream()
 * methods with a `gen_ai.invoke_agent` span.
 */
export function instrumentStateGraphCompile(
  originalCompile: (...args: unknown[]) => CompiledGraph,
  options: LangGraphOptions,
): (...args: unknown[]) => CompiledGraph {
  if (Object.prototype.hasOwnProperty.call(originalCompile, SENTRY_PATCHED)) {
    return originalCompile;
  }

  const sentryHandler = createLangChainCallbackHandler(options);

  const wrapped = new Proxy(originalCompile, {
    apply(target, thisArg, args: unknown[]): CompiledGraph {
      // Skip when called from within createReactAgent to avoid duplicate instrumentation
      if (_insideCreateReactAgent) {
        return Reflect.apply(target, thisArg, args);
      }

      const compiledGraph = Reflect.apply(target, thisArg, args);
      const compileOptions = args.length > 0 ? (args[0] as Record<string, unknown>) : {};

      // Instrument agent methods on the compiled graph
      const originalInvoke = compiledGraph.invoke;
      if (originalInvoke && typeof originalInvoke === 'function') {
        compiledGraph.invoke = instrumentCompiledGraphInvoke(
          originalInvoke.bind(compiledGraph) as (...args: unknown[]) => Promise<unknown>,
          compiledGraph,
          compileOptions,
          options,
          undefined,
          sentryHandler,
        );
      }

      const originalStream = compiledGraph.stream;
      if (originalStream && typeof originalStream === 'function') {
        compiledGraph.stream = instrumentCompiledGraphStream(
          originalStream.bind(compiledGraph),
          compiledGraph,
          compileOptions,
          options,
          undefined,
          sentryHandler,
        );
      }

      return compiledGraph;
    },
  });

  Object.defineProperty(wrapped, SENTRY_PATCHED, { value: true, enumerable: false });
  return wrapped;
}

/**
 * Instruments CompiledGraph's invoke method to create spans for agent invocation
 *
 * Creates a `gen_ai.invoke_agent` span when invoke() is called
 */
export function instrumentCompiledGraphInvoke(
  originalInvoke: (...args: unknown[]) => Promise<unknown>,
  graphInstance: CompiledGraph,
  compileOptions: Record<string, unknown>,
  options: LangGraphOptions,
  llm?: BaseChatModel | null,
  sentryCallbackHandler?: unknown,
): (...args: unknown[]) => Promise<unknown> {
  return instrumentCompiledGraphOperation(
    originalInvoke,
    graphInstance,
    compileOptions,
    options,
    llm,
    sentryCallbackHandler,
    false,
  );
}

export function instrumentCompiledGraphStream(
  originalStream: (...args: unknown[]) => Promise<AsyncIterable<unknown>>,
  graphInstance: CompiledGraph,
  compileOptions: Record<string, unknown>,
  options: LangGraphOptions,
  llm?: BaseChatModel | null,
  sentryCallbackHandler?: unknown,
): (...args: unknown[]) => Promise<AsyncIterable<unknown>> {
  return instrumentCompiledGraphOperation(
    originalStream,
    graphInstance,
    compileOptions,
    options,
    llm,
    sentryCallbackHandler,
    true,
  ) as (...args: unknown[]) => Promise<AsyncIterable<unknown>>;
}

function instrumentCompiledGraphOperation(
  originalOperation: (...args: unknown[]) => Promise<unknown>,
  graphInstance: CompiledGraph,
  compileOptions: Record<string, unknown>,
  options: LangGraphOptions,
  llm: BaseChatModel | null | undefined,
  sentryCallbackHandler: unknown,
  streaming: boolean,
): (...args: unknown[]) => Promise<unknown> {
  const graphInstrumentationId = getGraphInstrumentationId(graphInstance);

  return new Proxy(originalOperation, {
    apply(target, thisArg, args: unknown[]): Promise<unknown> {
      if (
        streaming &&
        getCurrentScope().getScopeData().sdkProcessingMetadata[LANGGRAPH_INVOKE_ACTIVE] === graphInstrumentationId
      ) {
        return Reflect.apply(target, thisArg, args);
      }

      const modelName = llm?.modelName ?? llm?.model;
      const spanOptions = {
        name: 'invoke_agent',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGGRAPH_ORIGIN,
          [SENTRY_OP]: GEN_AI_INVOKE_AGENT,
          [GEN_AI_OPERATION_NAME]: 'invoke_agent',
        },
      };
      const run = async (span: Span): Promise<unknown> => {
        try {
          const graphName = compileOptions?.name;

          if (graphName && typeof graphName === 'string') {
            span.setAttribute(GEN_AI_PIPELINE_NAME, graphName);
            span.setAttribute(GEN_AI_AGENT_NAME, graphName);
            span.updateName(`invoke_agent ${graphName}`);
          }

          if (modelName) {
            span.setAttribute(GEN_AI_REQUEST_MODEL, modelName);
          }

          // Extract thread_id from the config (second argument)
          // LangGraph uses config.configurable.thread_id for conversation/session linking
          const config = args.length > 1 ? (args[1] as Record<string, unknown> | undefined) : undefined;
          const configurable = config?.configurable as Record<string, unknown> | undefined;
          const threadId = configurable?.thread_id;
          if (threadId && typeof threadId === 'string') {
            span.setAttribute(GEN_AI_CONVERSATION_ID, threadId);
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

            invokeConfig.callbacks = _INTERNAL_mergeLangChainCallbackHandler(
              invokeConfig.callbacks,
              sentryCallbackHandler,
            );
          }

          // Extract available tools from the graph instance
          const tools = extractToolsFromCompiledGraph(graphInstance);
          if (tools) {
            span.setAttribute(GEN_AI_TOOL_DEFINITIONS, JSON.stringify(tools));
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
              span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
            }

            span.setAttributes({
              [GEN_AI_INPUT_MESSAGES]: stringify(filteredMessages),
            });
          }

          if (!streaming) {
            // LangGraph implements invoke() by consuming stream(); the shared async scope keeps that internal
            // call from producing a nested duplicate while leaving direct concurrent stream() calls unaffected.
            getCurrentScope().setSDKProcessingMetadata({
              [LANGGRAPH_INVOKE_ACTIVE]: graphInstrumentationId,
            });
          }

          const result = await Reflect.apply(target, thisArg, args);

          if (streaming) {
            if (isAsyncIterable(result)) {
              span.setAttribute(GEN_AI_RESPONSE_STREAMING, true);
              return instrumentStreamResult(result, span, inputMessages ?? null, recordOutputs);
            }

            span.end();
            return result;
          }

          if (recordOutputs) {
            setResponseAttributes(span, inputMessages ?? null, result);
          }

          return result;
        } catch (error) {
          // The error is rethrown to the caller, so we only mark the span failed and do not record it.
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          if (streaming) {
            span.end();
          }
          throw error;
        }
      };

      return streaming ? startSpanManual(spanOptions, run) : startSpan(spanOptions, run);
    },
  });
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

      // Wrap agent methods on the returned compiled graph
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
        );
      }

      const originalStream = compiledGraph.stream;
      if (originalStream && typeof originalStream === 'function') {
        const compileOptions: Record<string, unknown> = {};
        if (agentName) {
          compileOptions.name = agentName;
        }

        compiledGraph.stream = instrumentCompiledGraphStream(
          originalStream.bind(compiledGraph),
          compiledGraph,
          compileOptions,
          resolvedOptions,
          llm,
          sentryHandler,
        );
      }

      return compiledGraph;
    },
  });

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
 * import { instrumentStateGraph } from '@sentry/cloudflare';
 * import { StateGraph } from '@langchain/langgraph';
 *
 * const graph = new StateGraph(MessagesAnnotation)
 *   .addNode('agent', mockLlm)
 *   .addEdge(START, 'agent')
 *   .addEdge('agent', END);
 *
 * instrumentStateGraph(graph, { recordInputs: true, recordOutputs: true });
 * const compiled = graph.compile({ name: 'my_agent' });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentStateGraph<T extends { compile: (...args: any[]) => any }>(
  stateGraph: T,
  options?: LangGraphOptions,
): T {
  stateGraph.compile = instrumentStateGraphCompile(stateGraph.compile, resolveAIRecordingOptions(options));

  return stateGraph;
}
