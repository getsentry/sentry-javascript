import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { CompiledGraph, IntegrationFn, LangGraphOptions } from '@sentry/core';
import {
  _INTERNAL_getLangGraphCreateAgentSpanOptions,
  createLangChainCallbackHandler,
  debug,
  defineIntegration,
  extractAgentNameFromParams,
  extractLLMFromParams,
  instrumentCompiledGraphInvoke,
  LANGGRAPH_INTEGRATION_NAME,
  resolveAIRecordingOptions,
  startInactiveSpan,
  waitForTracingChannelBinding,
  wrapToolsWithSpans,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Same name as the OTel integration by design: when enabled, the OTel 'LangGraph' integration is
// dropped from the default set (see the Node opt-in loader).
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

// `createReactAgent` compiles a `StateGraph` internally; suppress the `create_agent` span for that
// nested compile so a react agent gets a single `invoke_agent` span, matching the OTel path.
let insideCreateReactAgent = false;

const _langGraphChannelIntegration = ((options: LangGraphOptions = {}) => {
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

      // `bindTracingChannelToSpan` needs the async-context binding that `initOpenTelemetry()` registers
      // after `setupOnce` runs, so wait for it before subscribing.
      waitForTracingChannelBinding(() => {
        // StateGraph.compile → `create_agent` span, then wrap the returned graph's `invoke`.
        DEBUG_BUILD &&
          debug.log(`[orchestrion:langgraph] subscribing to channel "${CHANNELS.LANGGRAPH_STATE_GRAPH_COMPILE}"`);
        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<CompileChannelContext>(CHANNELS.LANGGRAPH_STATE_GRAPH_COMPILE),
          data => {
            if (insideCreateReactAgent) {
              return undefined;
            }
            const compileOptions = getFirstArgObject(data.arguments);
            const name = typeof compileOptions?.name === 'string' ? compileOptions.name : undefined;

            return startInactiveSpan(_INTERNAL_getLangGraphCreateAgentSpanOptions(name));
          },
          {
            beforeSpanEnd: (_span, data) => {
              wrapCompiledGraphInvoke(
                data.result,
                getFirstArgObject(data.arguments) ?? {},
                resolvedOptions,
                null,
                sentryHandler,
              );
            },
          },
        );

        // createReactAgent has no `create_agent` span of its own; it only wraps tools and the returned
        // graph's `invoke`. Tools are wrapped at `start` (before the agent runs), invoke at `end`.
        DEBUG_BUILD &&
          debug.log(`[orchestrion:langgraph] subscribing to channel "${CHANNELS.LANGGRAPH_CREATE_REACT_AGENT}"`);
        const reactAgentChannel = diagnosticsChannel.tracingChannel<CreateReactAgentChannelContext>(
          CHANNELS.LANGGRAPH_CREATE_REACT_AGENT,
        );
        reactAgentChannel.start.subscribe(message => {
          const { arguments: args } = message as CreateReactAgentChannelContext;
          const params = getFirstArgObject(args);
          if (params && Array.isArray(params.tools) && params.tools.length > 0) {
            wrapToolsWithSpans(params.tools, resolvedOptions, extractAgentNameFromParams(args) ?? undefined);
          }
          // Set only after tool wrapping so a throw there can't leave the flag stuck on and permanently
          // suppress `create_agent` spans. The flag must be on before the body runs its internal compile.
          insideCreateReactAgent = true;
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
 * EXPERIMENTAL — orchestrion-driven LangGraph integration. Subscribes to the diagnostics_channels
 * injected into `@langchain/langgraph`'s `StateGraph.compile` and `createReactAgent`, so it requires
 * the orchestrion runtime hook or bundler plugin.
 */
export const langGraphChannelIntegration = defineIntegration(_langGraphChannelIntegration);
