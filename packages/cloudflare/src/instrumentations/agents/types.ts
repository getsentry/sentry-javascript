import { getCurrentScope } from '@sentry/core';

// v10 predates `@sentry/conventions` and doesn't expose this from `@sentry/core`, so keep the
// standard semantic attribute name locally.
const GEN_AI_AGENT_NAME_ATTRIBUTE = 'gen_ai.agent.name';

export const AGENT_SPAN_ORIGIN = 'auto.faas.cloudflare.agents';

/**
 * The subset of the `agents` `Agent` instance internals that we instrument. These are runtime
 * implementation details of the `agents` package (v0.13.x) rather than part of its public type
 * surface, so every access is guarded and wrapping degrades gracefully if a name changes upstream.
 */
export interface AgentInternals {
  /** Central choke-point through which all `agents:*` observability events are published. */
  _emit?: (type: string, payload?: Record<string, unknown>) => void;
  /** WebSocket message handler; dispatches `@callable()` RPC requests. */
  onMessage?: (...args: unknown[]) => unknown;
  /**
   * Chat-turn handler. Only `AIChatAgent` (from `@cloudflare/ai-chat`) defines this; a plain `Agent`
   * does not, so its presence discriminates a chat agent.
   */
  onChatMessage?: (...args: unknown[]) => unknown;
  /** HTTP request handler; the router sends every non-WebSocket request here. */
  onRequest?: (...args: unknown[]) => unknown;
  /** The user's Agent class (used by the SDK for the observability event `agent` field). */
  _ParentClass?: { name?: string };
  /** The Agent instance name, which in the Agents model identifies the conversation/thread. */
  name?: string;
  /**
   * Internal: the active conversation id, rotated when the chat is cleared (the `message:clear`
   * observability event) so a reset chat groups as a fresh conversation while the instance (and its
   * MCP/OAuth state) stays put. Set by `instrumentChatAgentConversation`; falls back to `name`
   * before the first clear.
   */
  __sentryConversationId?: string;
}

/** Reads best-effort agent identity attributes from the instance, tolerating missing internals. */
export function getAgentAttributes(instance: AgentInternals): Record<string, string> {
  const attributes: Record<string, string> = {};

  const agentClass = instance._ParentClass?.name;
  if (typeof agentClass === 'string' && agentClass) {
    attributes[GEN_AI_AGENT_NAME_ATTRIBUTE] = agentClass;
  }

  return attributes;
}

/**
 * Sets the agent instance's conversation id on the current scope for the duration of the
 * surrounding unit of work (chat turn, callable RPC call). In the Agents model one instance is one
 * conversation, so the instance `name` is the natural conversation id — for chat and plain agents
 * alike, since plain agents run LLM calls too (e.g. inside `@callable()` methods). Once the chat
 * has been cleared, the rotated `__sentryConversationId` takes precedence so LLM calls from any
 * unit of work group under the fresh conversation.
 *
 * `conversationIdIntegration` reads the id off the scope at `spanStart` and stamps
 * `gen_ai.conversation.id` onto AI spans created within the unit of work, correlating its model
 * and tool calls. Callers run inside a per-event forked scope (`wrapMethodWithSentry`), so the id
 * does not leak into unrelated events.
 */
export function setAgentConversationId(instance: AgentInternals): void {
  const conversationId = instance.__sentryConversationId ?? instance.name;

  if (typeof conversationId === 'string' && conversationId) {
    getCurrentScope().setConversationId(conversationId);
  }
}
