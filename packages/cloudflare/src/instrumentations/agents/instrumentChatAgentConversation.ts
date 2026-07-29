import { type AgentInternals, setAgentConversationId } from './types';

/**
 * For chat agents (`AIChatAgent` from `@cloudflare/ai-chat`), sets the conversation id on the active
 * scope for the duration of a chat turn. In the Agents model one agent instance is one conversation,
 * so the instance `name` is the natural conversation id.
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
