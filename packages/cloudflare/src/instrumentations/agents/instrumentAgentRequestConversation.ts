import { type AgentInternals, setAgentConversationId } from './types';

/**
 * Correlates the AI spans of an HTTP-driven agent turn with a conversation id on the active scope.
 *
 * `onRequest` is the third way into an agent, alongside chat turns and `@callable()` RPC: the
 * `agents` package routes any non-WebSocket request to it, which is how REST endpoints, webhooks
 * and other server-to-server callers reach an agent. Those turns run LLM calls just like the other
 * two, so they need the same correlation — without this, an agent reached over HTTP produces
 * `gen_ai` spans with no `gen_ai.conversation.id`.
 *
 * As with the other hooks, the id is not attached to spans here — `conversationIdIntegration` reads
 * it off the scope at `spanStart` and stamps `gen_ai.conversation.id` onto the AI spans created
 * inside the request.
 *
 * `agents` installs `onRequest` as an own property on the instance in the `Agent` constructor (the
 * same treatment `onMessage` gets), and we instrument after construction, so wrapping the own
 * property is what the routing layer ends up calling.
 */
export function instrumentAgentRequestConversation(obj: AgentInternals): void {
  const original = obj.onRequest;

  if (typeof original !== 'function') {
    return;
  }

  obj.onRequest = new Proxy(original, {
    apply(target, thisArg: AgentInternals, args: unknown[]): unknown {
      setAgentConversationId(thisArg);

      return Reflect.apply(target, thisArg, args);
    },
  });
}
