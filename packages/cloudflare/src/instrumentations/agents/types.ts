import { getCurrentScope } from '@sentry/core';

export const AGENT_SPAN_ORIGIN = 'auto.faas.cloudflare.agents';
export const AGENT_CLASS_ATTRIBUTE = 'cloudflare.agent.class';
export const AGENT_NAME_ATTRIBUTE = 'cloudflare.agent.name';
export const AGENT_SCHEDULE_ID_ATTRIBUTE = 'cloudflare.agent.schedule.id';
export const AGENT_FIBER_ID_ATTRIBUTE = 'cloudflare.agent.fiber.id';
export const AGENT_FIBER_NAME_ATTRIBUTE = 'cloudflare.agent.fiber.name';

/**
 * Shape of a scheduled-task row as passed to the Agent's internal `_executeScheduleCallback`.
 * We only rely on the two fields we read for span naming; everything else is ignored.
 */
export interface ScheduleRow {
  id?: string;
  callback?: string;
}

/**
 * The subset of the `agents` `Agent` instance internals that we instrument. These are runtime
 * implementation details of the `agents` package (v0.19.x) rather than part of its public type
 * surface, so every access is guarded and wrapping degrades gracefully if a name changes upstream.
 */
export interface AgentInternals {
  /** Central choke-point through which all `agents:*` observability events are published. */
  _emit?: (type: string, payload?: Record<string, unknown>) => void;
  /** WebSocket message handler; dispatches `@callable()` RPC requests. */
  onMessage?: (...args: unknown[]) => unknown;
  /** Dispatches a due scheduled task to its named callback. */
  _executeScheduleCallback?: (row: ScheduleRow) => unknown;
  /**
   * Chat-turn handler. Only `AIChatAgent` (from `@cloudflare/ai-chat`) defines this; a plain `Agent`
   * does not, so its presence discriminates a chat agent.
   */
  onChatMessage?: (...args: unknown[]) => unknown;
  /**
   * Lifecycle hook run once per isolate when the Agent starts. The SDK wraps this to restore state,
   * reconnect MCP servers and recover in-flight work before invoking the user's `onStart`.
   */
  onStart?: (...args: unknown[]) => unknown;
  /**
   * Runs one managed fiber (durable background task started via `runFiber`/`startFiber`) to
   * completion. `id` and `name` identify the fiber; the SDK traces its internal storage phases here.
   */
  _runFiberInternal?: (id: string, name: string, ...args: unknown[]) => unknown;
  /** The user's Agent class (used by the SDK for the observability event `agent` field). */
  _ParentClass?: { name?: string };
  /** The Agent instance name, which in the Agents model identifies the conversation/thread. */
  name?: string;
  /**
   * Internal: the active conversation id, rotated on `cf_agent_chat_clear` so a reset chat groups
   * as a fresh conversation while the instance (and its MCP/OAuth state) stays put. Set by
   * `instrumentChatAgentConversation`; falls back to `name` before the first clear.
   */
  __sentryConversationId?: string;
}

/** Reads best-effort agent identity attributes from the instance, tolerating missing internals. */
export function getAgentAttributes(instance: AgentInternals): Record<string, string> {
  const attributes: Record<string, string> = {};

  const agentClass = instance._ParentClass?.name;
  if (typeof agentClass === 'string' && agentClass) {
    attributes[AGENT_CLASS_ATTRIBUTE] = agentClass;
  }

  const agentName = instance.name;
  if (typeof agentName === 'string' && agentName) {
    attributes[AGENT_NAME_ATTRIBUTE] = agentName;
  }

  return attributes;
}

/**
 * Sets the agent instance's conversation id on the current scope for the duration of the
 * surrounding unit of work (chat turn, callable RPC call, scheduled task). In the Agents model one
 * instance is one conversation, so the instance `name` is the natural conversation id — for chat
 * and plain agents alike, since plain agents run LLM calls too (e.g. inside `@callable()` methods).
 * Once the chat has been cleared, the rotated `__sentryConversationId` takes precedence so LLM
 * calls from any unit of work group under the fresh conversation.
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
