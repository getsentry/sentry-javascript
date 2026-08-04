import { uuid4 } from '@sentry/core';
import { type AgentInternals, setAgentConversationId, storeAgentConversationId } from './types';

/**
 * For chat agents (`AIChatAgent` from `@cloudflare/ai-chat`), correlates each chat turn's AI spans
 * with a conversation id on the active scope.
 *
 * In the Agents model one agent instance is one long-lived conversation, so the conversation id is
 * minted once per instance and persisted to Durable Object storage, which is what carries it across
 * hibernation (that destroys the in-memory instance). When the user clears the chat, they expect a
 * fresh conversation — but recreating the Durable Object for that would also drop the MCP/OAuth
 * state stored per instance (GitHub/Sentry sign-in). To get a fresh conversation id *without*
 * losing that state, we rotate the persisted id when the SDK reports a cleared chat.
 *
 * The id itself is not attached to spans here — `setAgentConversationId` resolves it, and the SDK's
 * `conversationIdIntegration` picks it off the scope at `spanStart` to stamp
 * `gen_ai.conversation.id` onto the AI spans created inside the turn (e.g. by the Workers AI
 * instrumentation), which correlates a turn's model and tool calls.
 *
 * Plain (non-chat) `Agent`s do not define `onChatMessage`, so they are skipped here — their unit
 * of work is the callable RPC method, where `instrumentAgentCallableRpc` sets the conversation id
 * instead.
 */
export function instrumentChatAgentConversation(obj: AgentInternals): void {
  // Rotate the conversation id when the chat is cleared. `_emit` is the central choke-point through
  // which all `agents:*` observability events are published, and it already exists on the base
  // `Agent` class — so this hook composes with the RPC instrumentation, which keys off the same
  // surface. We shadow it with an own property so the original stays reachable on the prototype.
  const originalEmit = obj._emit;

  if (typeof originalEmit === 'function') {
    obj._emit = new Proxy(originalEmit, {
      apply(target, thisArg: AgentInternals, args: [string, Record<string, unknown>?]) {
        if (args[0] === 'message:clear') {
          storeAgentConversationId(thisArg, uuid4());
        }

        return Reflect.apply(target, thisArg, args);
      },
    });
  }

  const original = obj.onChatMessage;

  if (typeof original !== 'function') {
    return;
  }

  obj.onChatMessage = new Proxy(original, {
    async apply(target, thisArg: AgentInternals, args: unknown[]): Promise<unknown> {
      await setAgentConversationId(thisArg);

      return Reflect.apply(target, thisArg, args);
    },
  });
}
