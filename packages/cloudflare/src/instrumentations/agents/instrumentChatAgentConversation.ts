import { type AgentInternals, setAgentConversationId } from './types';

/**
 * For chat agents (`AIChatAgent` from `@cloudflare/ai-chat`), correlates each chat turn's AI spans
 * with a conversation id on the active scope.
 *
 * In the Agents model one agent instance is one long-lived conversation, so the instance `name` is
 * the base conversation id. When the user clears the chat, they expect a fresh conversation — but
 * recreating the Durable Object for that would also drop the MCP/OAuth state stored per instance
 * (GitHub/Sentry sign-in). To get a fresh conversation id *without* losing that state, we rotate an
 * in-memory id on the instance when the SDK reports a cleared chat, and stamp that (falling back to
 * the instance `name` before the first clear).
 *
 * The id itself is not attached to spans here — the SDK's `conversationIdIntegration` reads it off
 * the scope at `spanStart` and stamps `gen_ai.conversation.id` onto the AI spans created inside the
 * turn (e.g. by the Workers AI instrumentation), which correlates a turn's model and tool calls.
 *
 * Plain (non-chat) `Agent`s do not define `onChatMessage`, so they are skipped here — their unit
 * of work is the callable RPC method, where `instrumentAgentCallableRpc` sets the conversation id
 * instead.
 */
export function instrumentChatAgentConversation(obj: AgentInternals): void {
  // Rotate the conversation id when the chat is cleared. `_emit` is the central choke-point through
  // which all `agents:*` observability events are published, and it already exists on the base
  // `Agent` class — so this hook composes with the RPC instrumentation, which keys off the same
  // surface. We shadow it with an own-property wrapper that defers to the original.
  const originalEmit = obj._emit;
  if (typeof originalEmit === 'function') {
    obj._emit = function (this: AgentInternals, type: string, payload?: Record<string, unknown>): void {
      if (type === 'message:clear') {
        this.__sentryConversationId = crypto.randomUUID();
      }
      return originalEmit.call(this, type, payload);
    };
  }

  const original = obj.onChatMessage;
  if (typeof original !== 'function') {
    return;
  }

  obj.onChatMessage = new Proxy(original, {
    apply(target, thisArg: AgentInternals, args: unknown[]): unknown {
      setAgentConversationId(thisArg);

      return Reflect.apply(target, thisArg, args);
    },
  });
}
