import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { debug, getCurrentScope, getIsolationScope, uuid4 } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { InstrumentedDurableObjectState } from '../../wrapMethodWithSentry';

// v10 predates `@sentry/conventions` and doesn't expose this from `@sentry/core`, so keep the
// standard semantic attribute name locally.
const GEN_AI_AGENT_NAME_ATTRIBUTE = 'gen_ai.agent.name';

export const AGENT_SPAN_ORIGIN = 'auto.faas.cloudflare.agents';

/** DO storage key under which the conversation id is persisted so it survives hibernation. */
export const AGENT_CONVERSATION_ID_STORAGE_KEY = '__SENTRY_AGENT_CONVERSATION_ID__';

/**
 * Instance keys for our conversation-id bookkeeping, keyed by symbol so the state stays invisible
 * to anything enumerating the user-owned agent instance (`Object.keys`, `JSON.stringify`, spread).
 * Exported because the exported `AgentInternals` interface references them.
 */
export const AGENT_CONVERSATION_ID_SYMBOL: unique symbol = Symbol('sentryAgentConversationId');
export const AGENT_APPLIED_CONVERSATION_ID_SYMBOL: unique symbol = Symbol('sentryAgentAppliedConversationId');

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
  /** The Agent instance name, reported as the `cloudflare.agent.name` span attribute. */
  name?: string;
  /**
   * The Durable Object state of the instance. Present on every real Agent; guarded like the other
   * internals so partially-mocked instances keep working.
   */
  ctx?: InstrumentedDurableObjectState;
  /**
   * The current conversation id for this agent instance. It is cached in memory after being loaded
   * from Durable Object storage and updated when the conversation rotates. `undefined` means storage
   * has not been read yet.
   */
  [AGENT_CONVERSATION_ID_SYMBOL]?: string;
  /**
   * The conversation id this instrumentation most recently applied to the isolation scope. It lets
   * subsequent units of work distinguish an SDK-applied id, which may be replaced after rotation,
   * from an id explicitly set by the user, which must be preserved.
   */
  [AGENT_APPLIED_CONVERSATION_ID_SYMBOL]?: string;
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
 * Persists the conversation id to Durable Object storage, so it survives hibernation, and updates
 * the in-memory cache synchronously so the current wake is immediately consistent even if the
 * write fails. Uses the async storage API, which exists on KV- and SQLite-backed DOs alike.
 * The write is fire-and-forget: DO storage writes are tracked by the runtime and land without
 * awaiting (`waitUntil` is a no-op in Durable Objects), and the catch keeps a rejection from
 * surfacing as unhandled — a failed write just means the next wake starts a new conversation,
 * which must never throw into user code. Uses the original uninstrumented storage so internal
 * bookkeeping doesn't create spans.
 */
export function storeAgentConversationId(instance: AgentInternals, conversationId: string): void {
  instance[AGENT_CONVERSATION_ID_SYMBOL] = conversationId;

  const storage = resolveStorage(instance);
  if (!storage) {
    return;
  }

  try {
    storage
      .put(AGENT_CONVERSATION_ID_STORAGE_KEY, conversationId)
      .catch(error => DEBUG_BUILD && debug.log('[Sentry] Failed to persist agent conversation id', error));
  } catch (error) {
    DEBUG_BUILD && debug.log('[Sentry] Failed to persist agent conversation id', error);
  }
}

/**
 * Sets the agent instance's conversation id on the active scope for the duration of the
 * surrounding unit of work (chat turn, callable RPC call, HTTP request). In the Agents model one
 * instance is one long-lived conversation, so the id is minted once per instance and persisted to
 * DO storage — for chat and plain agents alike, since plain agents run LLM calls too (e.g. inside
 * `@callable()` methods). The instance `name` is deliberately not used: it is caller-chosen and can
 * be a stable, guessable, or shared value, whereas a conversation id should identify exactly one
 * conversation. Clearing the chat rotates it (see `storeAgentConversationId`) so subsequent LLM
 * calls group under the fresh conversation.
 *
 * Every handler wrapper awaits this before invoking the original, so the id is on the scope before
 * the unit of work — and any `gen_ai` span it creates — starts. Only the first unit of work per wake
 * pays the storage read; the rest resolve from the in-memory cache. Awaiting is safe on all three
 * paths because the `agents` `Agent` constructor already replaces `onMessage` and `onRequest` with
 * `async` wrappers of its own, and `onChatMessage` is async by contract, so every caller upstream
 * already handles a promise.
 *
 * An id the user set explicitly outranks this inferred one, in either order: a `setConversationId()`
 * call that already happened is detected here and left alone, and one made inside the handler lands
 * on the same scope afterwards and therefore wins. That is why the write targets the isolation scope
 * — it is the scope the public `Sentry.setConversationId()` writes to, and `conversationIdIntegration`
 * prefers the current scope over it, so writing there would make a user's call unoverridable.
 *
 * `conversationIdIntegration` reads the id off the scope at `spanStart` and stamps
 * `gen_ai.conversation.id` onto AI spans created within the unit of work, correlating its model and
 * tool calls.
 */
export async function setAgentConversationId(instance: AgentInternals): Promise<void> {
  const isolationScope = getIsolationScope();
  const existing = isolationScope.getScopeData().conversationId ?? getCurrentScope().getScopeData().conversationId;

  // An id that isn't the one we put there ourselves came from the user — never override it.
  if (existing && existing !== instance[AGENT_APPLIED_CONVERSATION_ID_SYMBOL]) {
    return;
  }

  const conversationId = instance[AGENT_CONVERSATION_ID_SYMBOL] ?? (await loadAgentConversationId(instance));

  instance[AGENT_APPLIED_CONVERSATION_ID_SYMBOL] = conversationId;
  isolationScope.setConversationId(conversationId);
}

/**
 * Reads the persisted id into the instance cache, minting and persisting a fresh one when storage
 * holds none, so subsequent units of work resolve from memory. The async `get` exists on KV- and
 * SQLite-backed DOs alike, so this one path covers both.
 *
 * Anything already cached by the time the read lands wins over the read: that covers a rotation
 * (cleared chat) racing the read, and a second concurrent unit of work that must not mint and
 * persist a competing id for the same conversation.
 */
async function loadAgentConversationId(instance: AgentInternals): Promise<string> {
  let stored: unknown;
  let readFailed = false;

  try {
    stored = await resolveStorage(instance)?.get<string>(AGENT_CONVERSATION_ID_STORAGE_KEY);
  } catch (error) {
    readFailed = true;
    DEBUG_BUILD && debug.log('[Sentry] Failed to read agent conversation id from storage', error);
  }

  const cached = instance[AGENT_CONVERSATION_ID_SYMBOL];

  if (cached !== undefined) {
    return cached;
  }

  if (typeof stored === 'string' && stored) {
    instance[AGENT_CONVERSATION_ID_SYMBOL] = stored;

    return stored;
  }

  const conversationId = uuid4();

  if (readFailed) {
    // Cache without persisting: a read that failed may still have an id behind it, and overwriting
    // it would split the conversation for good instead of just for this wake.
    instance[AGENT_CONVERSATION_ID_SYMBOL] = conversationId;
  } else {
    storeAgentConversationId(instance, conversationId);
  }

  return conversationId;
}

/**
 * Resolves the uninstrumented DO storage for internal reads/writes, so they don't create spans of
 * their own. Falls back to the instance's regular storage when the uninstrumented one isn't
 * exposed (e.g. when `instrumentCloudflareAgent` is used directly, without `instrumentContext`).
 */
function resolveStorage(instance: AgentInternals): DurableObjectStorage | undefined {
  return instance.ctx?.originalStorage ?? instance.ctx?.storage;
}
