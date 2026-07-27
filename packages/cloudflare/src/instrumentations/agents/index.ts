import { GLOBAL_OBJ } from '@sentry/core';
import { instrumentAgentCallableRpc } from './instrumentAgentCallableRpc';
import { instrumentAgentFiber } from './instrumentAgentFiber';
import { instrumentAgentSchedule } from './instrumentAgentSchedule';
import { instrumentAgentStart } from './instrumentAgentStart';
import { instrumentChatAgentConversation } from './instrumentChatAgentConversation';
import type { AgentInternals } from './types';

/**
 * Whether the orchestrion bundler plugin injected tracing channels into the `agents` package (its
 * `__SENTRY_ORCHESTRION__.bundler` marker lists it). When it did, the schedule-task and fiber spans
 * come from the channel subscriber (`agentsChannelIntegration`) rather than method-wrapping, so the
 * corresponding monkey-patches here are skipped. The RPC dispatch and `onStart` live inside
 * constructor-installed closures, so they can't be channel-injected and stay method-wrapped either way.
 */
function isAgentsOrchestrionInjected(): boolean {
  const bundler = GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.bundler;
  return Array.isArray(bundler) && bundler.includes('agents');
}

/**
 * Instruments an instance of a Cloudflare [`agents`](https://www.npmjs.com/package/agents) `Agent`
 * with Sentry, adding telemetry that is specific to the Agent's runtime behavior:
 *
 * - **Callable RPC spans** — a span (op `rpc`) for each `@callable()` method invoked over WebSocket.
 * - **Scheduled-task spans** — a span (op `function`) for each scheduled/queued callback execution.
 * - **Agent-start spans** — a span (op `function`) for the per-isolate `onStart` cold-start phase
 *   (state restore, MCP reconnect, in-flight work recovery, the user's `onStart`).
 * - **Fiber-run spans** — a span (op `function`) for each managed fiber (`runFiber`/`startFiber`).
 * - **Conversation correlation** — sets the conversation id on the scope for each unit of agent
 *   work — chat turn, callable RPC call, or scheduled task — so `gen_ai` spans created within it
 *   are correlated, for chat and plain agents alike. Defaults to the instance `name` and is rotated
 *   when the chat is cleared (`cf_agent_chat_clear`).
 *
 * It only hooks the `agents` package internals and uses Sentry's tracing primitives. On Cloudflare
 * Workers, prefer `instrumentAgentWithSentry`, which additionally instruments the Durable Object
 * handlers and initializes the SDK; that function calls this one internally.
 *
 * The hooks replace own-properties on the instance and defer to the original implementation, so
 * they compose with any other instrumentation applied to the same instance.
 *
 * @param agent The `agents` `Agent` instance to instrument.
 * @returns The same instance, instrumented.
 *
 * @internal Use `instrumentAgentWithSentry` instead — this is called internally by it.
 */
export function instrumentCloudflareAgent<T extends object>(agent: T): T {
  const internals = agent as T & AgentInternals;

  const orchestrionInjected = isAgentsOrchestrionInjected();

  instrumentAgentCallableRpc(internals);
  if (!orchestrionInjected) {
    // The orchestrion channel subscriber produces these spans when `agents` is channel-injected.
    instrumentAgentSchedule(internals);
    instrumentAgentFiber(internals);
  }
  instrumentAgentStart(internals);
  instrumentChatAgentConversation(internals);

  return agent;
}
