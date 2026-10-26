import { getCurrentScope, SPAN_STATUS_ERROR, startSpan } from '@sentry/core';
import { resolveAIRecordingOptions } from '../core/utils';
import { createLangChainCallbackHandler } from '../langchain';
import type { BaseChatModel } from '../langchain/types';
import { getAgentSpanOptions, getInvokeMarker, LANGGRAPH_INVOKE_ACTIVE, prepareAgentSpan } from './agent-span';
import { instrumentCompiledGraphStream } from './stream';
import type { CompiledGraph, LangGraphOptions } from './types';
import { extractAgentNameFromParams, extractLLMFromParams, setResponseAttributes, wrapToolsWithSpans } from './utils';

let _insideCreateReactAgent = false;
// Set while a manual wrapper runs the original `compile`/`createReactAgent`. The integration's channel hooks
// fire synchronously inside that call, and skip the graph so the options passed explicitly win.
let _insideManualInstrumentation = false;

const SENTRY_PATCHED = '__sentry_patched__';
const INSTRUMENTED_GRAPHS = new WeakSet<object>();

/** Whether manual `instrumentStateGraph()`/`instrumentCreateReactAgent()` is creating a graph right now. */
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

/**
 * Instruments StateGraph's compile method to wrap the returned compiled graph's invoke() and stream() with a
 * `gen_ai.invoke_agent` span.
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
  if (!graph || typeof graph !== 'object' || INSTRUMENTED_GRAPHS.has(graph)) {
    return;
  }
  INSTRUMENTED_GRAPHS.add(graph);

  const compiledGraph = graph as CompiledGraph;
  const { invoke, stream } = compiledGraph;
  if (typeof invoke === 'function') {
    compiledGraph.invoke = instrumentCompiledGraphInvoke(
      invoke.bind(compiledGraph),
      compiledGraph,
      compileOptions,
      options,
      llm,
      sentryCallbackHandler,
    );
  }
  if (typeof stream === 'function') {
    compiledGraph.stream = instrumentCompiledGraphStream(
      stream.bind(compiledGraph),
      compiledGraph,
      compileOptions,
      options,
      llm,
      sentryCallbackHandler,
    );
  }
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
  const invokeMarker = getInvokeMarker(graphInstance);

  return new Proxy(originalInvoke, {
    apply(target, thisArg, args: unknown[]): Promise<unknown> {
      return startSpan(getAgentSpanOptions(args), async span => {
        try {
          const inputMessages = prepareAgentSpan(
            span,
            args,
            graphInstance,
            compileOptions,
            options,
            llm,
            sentryCallbackHandler,
          );
          getCurrentScope().setSDKProcessingMetadata({ [LANGGRAPH_INVOKE_ACTIVE]: invokeMarker });

          const result = await Reflect.apply(target, thisArg, args);

          if (options.recordOutputs) {
            setResponseAttributes(span, inputMessages, result);
          }

          return result;
        } catch (error) {
          // The error is rethrown to the caller (invoke() rejects), so we only mark the span failed
          // and do not record it.
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          throw error;
        }
      });
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
