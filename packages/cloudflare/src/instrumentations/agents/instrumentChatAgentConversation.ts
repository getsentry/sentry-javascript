import { type AgentInternals, setAgentConversationId } from './types';

/**
 * For chat agents (`AIChatAgent` from `@cloudflare/ai-chat`), correlates each chat turn's AI spans
 * with a conversation id on the active scope.
 *
 * In the Agents model one agent instance is one long-lived conversation, so the instance `name` is
 * the base conversation id. When the user clears the chat (`cf_agent_chat_clear`), they expect a
 * fresh conversation — but recreating the Durable Object for that would also drop the MCP/OAuth
 * state stored per instance (GitHub/Sentry sign-in). To get a fresh conversation id *without*
 * losing that state, we rotate an in-memory id on the instance when a `cf_agent_chat_clear` message
 * arrives, and stamp that (falling back to the instance `name` before the first clear).
 *
 * The id itself is not attached to spans here — the SDK's `conversationIdIntegration` reads it off
 * the scope at `spanStart` and stamps `gen_ai.conversation.id` onto the AI spans created inside the
 * turn (e.g. by the Workers AI instrumentation), which correlates a turn's model and tool calls.
 *
 * Plain (non-chat) `Agent`s do not define `onChatMessage`, so they are skipped here — their units
 * of work are callable RPC methods and scheduled tasks, where `instrumentAgentCallableRpc` and
 * `instrumentAgentSchedule` set the conversation id instead.
 */
export function instrumentChatAgentConversation(obj: AgentInternals): void {
  // Watch the WebSocket message stream for a chat-clear and rotate the conversation id. This runs
  // on the same instance (preserving MCP/OAuth state) — only the correlation id changes.
  const originalOnMessage = obj.onMessage;
  if (typeof originalOnMessage === 'function') {
    obj.onMessage = function (this: AgentInternals, ...args: unknown[]): unknown {
      if (extractMessageType(args[1]) === 'cf_agent_chat_clear') {
        this.__sentryConversationId = crypto.randomUUID();
      }
      return originalOnMessage.apply(this, args);
    };
  }

  const original = obj.onChatMessage;
  if (typeof original !== 'function') {
    return;
  }

  obj.onChatMessage = function (this: AgentInternals, ...args: unknown[]): unknown {
    setAgentConversationId(this);

    return original.apply(this, args);
  };
}

/** Extracts the `type` field from a WebSocket message (JSON string or ArrayBuffer), if any. */
function extractMessageType(message: unknown): string | undefined {
  const text =
    typeof message === 'string'
      ? message
      : message instanceof ArrayBuffer
        ? new TextDecoder().decode(message)
        : undefined;

  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as { type?: unknown };
    return typeof parsed.type === 'string' ? parsed.type : undefined;
  } catch {
    return undefined;
  }
}
