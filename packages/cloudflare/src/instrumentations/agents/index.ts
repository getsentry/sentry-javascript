import { instrumentAgentCallableRpc } from './instrumentAgentCallableRpc';
import { instrumentAgentSchedule } from './instrumentAgentSchedule';
import { instrumentChatAgentConversation } from './instrumentChatAgentConversation';
import type { AgentInternals } from './types';

/**
 * Instruments an instance of a Cloudflare [`agents`](https://www.npmjs.com/package/agents) `Agent`
 * with Sentry, adding telemetry that is specific to the Agent's runtime behavior:
 *
 * - **Callable RPC spans** — a span (op `rpc`) for each `@callable()` method invoked over WebSocket.
 * - **Scheduled-task spans** — a span (op `function`) for each scheduled/queued callback execution.
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

  instrumentAgentCallableRpc(internals);
  instrumentAgentSchedule(internals);
  instrumentChatAgentConversation(internals);

  return agent;
}
