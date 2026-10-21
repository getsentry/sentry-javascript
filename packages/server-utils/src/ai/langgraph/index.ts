/* eslint-disable typescript-eslint/no-deprecated */
import { getCurrentScope, SPAN_STATUS_ERROR, startSpan, startSpanManual, stringify } from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { extractSystemInstructions, isAsyncIterable, resolveAIRecordingOptions } from '../core/utils';
import { createLangChainCallbackHandler } from '../langchain';
import type { BaseChatModel, LangChainMessage } from '../langchain/types';
import {
  _INTERNAL_mergeLangChainCallbackHandler,
  getConversationIdFromMetadata,
  getConversationIdMetadataFromConfig,
  normalizeLangChainMessages,
} from '../langchain/utils';
import { LANGGRAPH_ORIGIN } from './constants';
import { instrumentStreamResult } from './streaming';
import type { CompiledGraph, LangGraphOptions } from './types';
import {
  extractAgentNameFromParams,
  extractLLMFromParams,
  extractToolsFromCompiledGraph,
  setResponseAttributes,
  wrapToolsWithSpans,
} from './utils';

let _insideCreateReactAgent = false;
// Set while a manual wrapper runs the original sync `compile`/`createReactAgent`, so the integration's
// channel hooks (which fire inside that call) leave the graph to the options the user passed explicitly.
let _insideManualInstrumentation = false;

/** Whether a manual `instrumentStateGraph()` / `instrumentCreateReactAgent()` call is in progress. */
export function isInsideManualLangGraphInstrumentation(): boolean {
  return _insideManualInstrumentation;
}

function runManually<T>(callback: () => T): T {
  const previous = _insideManualInstrumentation;
  _insideManualInstrumentation = true;
  try {
    return callback();
  } finally {
    _insideManualInstrumentation = previous;
  }
}

const SENTRY_PATCHED = '__sentry_patched__';
// invoke() drains this.stream() internally. Unlike Anthropic's sync flag, the marker lives on the span's
// scope, so it still holds if LangGraph ever awaits before that call.
const LANGGRAPH_INVOKE_ACTIVE = 'sentry_langgraph_invoke_active';

// One marker per graph, so a stream() of another graph inside invoke() still gets its own span. A graph
// already in here is instrumented: manual `instrumentStateGraph()` and the integration can both see it.
const INVOKE_MARKERS = new WeakMap<object, symbol>();

function getInvokeMarker(graph: object): symbol {
  let marker = INVOKE_MARKERS.get(graph);
  if (!marker) {
    marker = Symbol('sentry.langgraph.invoke');
    INVOKE_MARKERS.set(graph, marker);
  }
  return marker;
}

/**
 * Instruments StateGraph's compile method to wrap the returned compiled graph's invoke() and stream()
 * methods with a `gen_ai.invoke_agent` span.
 */
export function instrumentStateGraphCompile(
  originalCompile: (...args: unknown[]) => CompiledGraph,
  rawOptions: LangGraphOptions,
): (...args: unknown[]) => CompiledGraph {
  if (Object.prototype.hasOwnProperty.call(originalCompile, SENTRY_PATCHED)) {
    return originalCompile;
  }

  // This is exported, so callers can hand us an options object with no recording flags set. Resolving
  // here (rather than only in `instrumentStateGraph`) keeps that path on the `dataCollection` defaults.
  const options = resolveAIRecordingOptions(rawOptions);
  const sentryHandler = createLangChainCallbackHandler(options);

  const wrapped = new Proxy(originalCompile, {
    apply(target, thisArg, args: unknown[]): CompiledGraph {
      // Skip when called from within createReactAgent to avoid duplicate instrumentation
      if (_insideCreateReactAgent) {
        return Reflect.apply(target, thisArg, args);
      }

      const compiledGraph = runManually(() => Reflect.apply(target, thisArg, args));
      const compileOptions = args.length > 0 ? (args[0] as Record<string, unknown>) : {};
      instrumentCompiledGraph(compiledGraph, compileOptions, options, undefined, sentryHandler);

      return compiledGraph;
    },
  });

  Object.defineProperty(wrapped, SENTRY_PATCHED, { value: true, enumerable: false });
  return wrapped;
}

/**
 * Wraps a compiled graph's `invoke()` and `stream()` with `gen_ai.invoke_agent` spans, once per graph.
 */
export function instrumentCompiledGraph(
  graph: unknown,
  compileOptions: Record<string, unknown>,
  options: LangGraphOptions,
  llm: BaseChatModel | null | undefined,
  sentryCallbackHandler: unknown,
): void {
  if (!graph || typeof graph !== 'object' || INVOKE_MARKERS.has(graph)) {
    return;
  }
  getInvokeMarker(graph);

  const compiledGraph = graph as CompiledGraph;
  for (const method of ['invoke', 'stream'] as const) {
    const original = compiledGraph[method];
    if (typeof original === 'function') {
      (compiledGraph as Record<string, unknown>)[method] = instrumentCompiledGraphOperation(
        original.bind(compiledGraph) as (...args: unknown[]) => Promise<unknown>,
        compiledGraph,
        compileOptions,
        options,
        llm,
        sentryCallbackHandler,
        method === 'stream',
      );
    }
  }
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
  const invokeMarker = getInvokeMarker(graphInstance);

  return new Proxy(originalOperation, {
    apply(target, thisArg, args: unknown[]): Promise<unknown> {
      if (
        streaming &&
        getCurrentScope().getScopeData().sdkProcessingMetadata[LANGGRAPH_INVOKE_ACTIVE] === invokeMarker
      ) {
        // Only the first stream() is invoke's implementation detail; recursive calls need their own spans.
        getCurrentScope().setSDKProcessingMetadata({ [LANGGRAPH_INVOKE_ACTIVE]: undefined });
        return Reflect.apply(target, thisArg, args);
      }

      const modelName = llm?.modelName ?? llm?.model;
      const config = args.length > 1 ? (args[1] as Record<string, unknown> | undefined) : undefined;
      const spanOptions = {
        name: 'invoke_agent',
        attributes: {
          // Set before `spanStart`, so an id from `Sentry.setConversationId()` wins, as on the child spans
          ...getConversationIdFromMetadata(config?.configurable as Record<string, unknown> | undefined),
          [SENTRY_ORIGIN]: LANGGRAPH_ORIGIN,
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

          // Inject callback handler and agent name into invoke config
          if (sentryCallbackHandler) {
            const invokeConfig = (args[1] ?? {}) as Record<string, unknown>;
            args[1] = invokeConfig;

            const existingMetadata = (invokeConfig.metadata ?? {}) as Record<string, unknown>;
            invokeConfig.metadata = {
              ...getConversationIdMetadataFromConfig(invokeConfig),
              ...existingMetadata,
              __sentry_langgraph__: true,
              ...(typeof graphName === 'string' ? { lc_agent_name: graphName } : {}),
            };

            invokeConfig.callbacks = _INTERNAL_mergeLangChainCallbackHandler(
              invokeConfig.callbacks,
              sentryCallbackHandler,
            );
          }

          const recordInputs = options.recordInputs;
          const recordOutputs = options.recordOutputs;

          // Extract available tools from the graph instance
          const tools = recordInputs ? extractToolsFromCompiledGraph(graphInstance) : null;
          if (tools) {
            span.setAttribute(GEN_AI_TOOL_DEFINITIONS, JSON.stringify(tools));
          }

          // Custom state annotations have no `messages` array, the whole state is recorded instead.
          const inputState = args[0] as { messages?: LangChainMessage[]; lg_name?: string } | null | undefined;
          const inputMessages = Array.isArray(inputState?.messages) ? inputState.messages : null;
          // `new Command({ resume })` resumes an interrupted run and carries no user turn (LangGraph
          // tags it `lg_name: 'Command'`), so skip it like a `null` resume rather than recording the
          // control object as a message nobody wrote.
          const isResumeCommand = inputState?.lg_name === 'Command';

          if (recordInputs) {
            if (inputMessages) {
              const normalizedMessages = normalizeLangChainMessages(inputMessages);
              const { systemInstructions, filteredMessages } = extractSystemInstructions(normalizedMessages);

              if (systemInstructions) {
                span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
              }

              span.setAttributes({
                [GEN_AI_INPUT_MESSAGES]: stringify(filteredMessages),
              });
            } else if (inputState && typeof inputState === 'object' && !isResumeCommand) {
              span.setAttribute(GEN_AI_INPUT_MESSAGES, stringify([{ role: 'user', content: stringify(inputState) }]));
            }
          }

          if (!streaming) {
            getCurrentScope().setSDKProcessingMetadata({ [LANGGRAPH_INVOKE_ACTIVE]: invokeMarker });
          }

          const result = await Reflect.apply(target, thisArg, args);

          if (streaming) {
            if (isAsyncIterable(result)) {
              span.setAttribute(GEN_AI_RESPONSE_STREAMING, true);
              try {
                return instrumentStreamResult(result, span, inputMessages, recordOutputs);
              } catch {
                // An unpatchable stream (e.g. frozen) still belongs to the caller; only the span is lost.
                span.end();
                return result;
              }
            }

            span.end();
            return result;
          }

          if (recordOutputs) {
            setResponseAttributes(span, inputMessages, result);
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
        compiledGraph = runManually(() => Reflect.apply(target, thisArg, args));
      } finally {
        _insideCreateReactAgent = false;
      }

      const compileOptions: Record<string, unknown> = agentName ? { name: agentName } : {};
      instrumentCompiledGraph(compiledGraph, compileOptions, resolvedOptions, llm, sentryHandler);

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
