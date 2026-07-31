import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { CompiledGraph, IntegrationFn, LangGraphOptions } from '@sentry/core';
import {
  createLangChainCallbackHandler,
  debug,
  defineIntegration,
  extractAgentNameFromParams,
  extractLLMFromParams,
  instrumentCompiledGraphInvoke,
  LANGGRAPH_INTEGRATION_NAME,
  resolveAIRecordingOptions,
  wrapToolsWithSpans,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';

// Same name as the OTel integration by design, so the OTel 'LangGraph' integration is
// deduplicated out of the default set.
const INTEGRATION_NAME = LANGGRAPH_INTEGRATION_NAME;

interface CompileChannelContext {
  arguments: unknown[];
  result?: unknown;
}

interface CreateReactAgentChannelContext {
  arguments: unknown[];
  result?: unknown;
}

let subscribed = false;

// `createReactAgent` compiles a `StateGraph` internally. When set, the compile subscriber skips that
// nested graph so its `invoke` is wrapped once (by the createReactAgent handler), not twice.
let insideCreateReactAgent = false;

const _langGraphIntegration = ((options: LangGraphOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19, and a second `init()` would double-subscribe.
      if (!diagnosticsChannel.tracingChannel || subscribed) {
        return;
      }
      subscribed = true;

      const resolvedOptions = resolveAIRecordingOptions(options);
      const sentryHandler = createLangChainCallbackHandler(resolvedOptions);

      // StateGraph.compile returns synchronously; wrap the returned graph's `invoke` at `end`.
      DEBUG_BUILD &&
        debug.log(`[orchestrion:langgraph] subscribing to channel "${CHANNELS.LANGGRAPH_STATE_GRAPH_COMPILE}"`);
      diagnosticsChannel
        .tracingChannel<CompileChannelContext>(CHANNELS.LANGGRAPH_STATE_GRAPH_COMPILE)
        .end.subscribe(message => {
          if (insideCreateReactAgent) {
            return;
          }
          const { arguments: args, result } = message as CompileChannelContext;
          wrapCompiledGraphInvoke(result, getFirstArgObject(args) ?? {}, resolvedOptions, null, sentryHandler);
        });

      // createReactAgent only wraps tools and the returned graph's `invoke`. Tools are wrapped at
      // `start` (before the agent runs), invoke at `end`.
      DEBUG_BUILD &&
        debug.log(`[orchestrion:langgraph] subscribing to channel "${CHANNELS.LANGGRAPH_CREATE_REACT_AGENT}"`);
      const reactAgentChannel = diagnosticsChannel.tracingChannel<CreateReactAgentChannelContext>(
        CHANNELS.LANGGRAPH_CREATE_REACT_AGENT,
      );
      reactAgentChannel.start.subscribe(message => {
        // `createReactAgent` runs synchronously and compiles a `StateGraph` internally, so the flag
        // must be on for the duration and off by `end`. It's set here (never in a branch that can
        // throw) and cleared in both `end` and `error`, so it can neither stick on across calls nor
        // stay off during this call's nested compile. Tool wrapping is guarded for the same reason.
        insideCreateReactAgent = true;
        try {
          const { arguments: args } = message as CreateReactAgentChannelContext;
          const params = getFirstArgObject(args);
          if (params && Array.isArray(params.tools) && params.tools.length > 0) {
            wrapToolsWithSpans(params.tools, resolvedOptions, extractAgentNameFromParams(args) ?? undefined);
          }
        } catch (error) {
          DEBUG_BUILD && debug.error('[orchestrion:langgraph] failed to wrap createReactAgent tools', error);
        }
      });
      reactAgentChannel.end.subscribe(message => {
        insideCreateReactAgent = false;
        const { arguments: args, result } = message as CreateReactAgentChannelContext;
        const agentName = extractAgentNameFromParams(args) ?? undefined;
        const compileOptions = agentName ? { name: agentName } : {};
        wrapCompiledGraphInvoke(result, compileOptions, resolvedOptions, extractLLMFromParams(args), sentryHandler);
      });
      // Make sure a thrown `createReactAgent` doesn't leave the suppression flag stuck on.
      reactAgentChannel.error.subscribe(() => {
        insideCreateReactAgent = false;
      });
    },
  };
}) satisfies IntegrationFn;

function getFirstArgObject(args: unknown[] | undefined): Record<string, unknown> | undefined {
  const first = (args ?? [])[0];

  return typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : undefined;
}

/**
 * Wrap the compiled graph's `invoke` with the shared `invoke_agent` instrumentation, exactly as the
 * OTel path does on the returned graph.
 */
function wrapCompiledGraphInvoke(
  graph: unknown,
  compileOptions: Record<string, unknown>,
  options: LangGraphOptions,
  llm: ReturnType<typeof extractLLMFromParams>,
  sentryHandler: unknown,
): void {
  if (!graph || typeof graph !== 'object') {
    return;
  }

  const compiledGraph = graph as CompiledGraph;
  const originalInvoke = compiledGraph.invoke;
  if (typeof originalInvoke === 'function') {
    compiledGraph.invoke = instrumentCompiledGraphInvoke(
      originalInvoke.bind(compiledGraph),
      compiledGraph,
      compileOptions,
      options,
      llm,
      sentryHandler,
    );
  }
}

/**
 * Orchestrion-driven LangGraph integration. Subscribes to the diagnostics_channels
 * injected into `@langchain/langgraph`'s `StateGraph.compile` and `createReactAgent`, so it requires
 * the orchestrion runtime hook or bundler plugin.
 */
export const langGraphIntegration = defineIntegration(_langGraphIntegration);
