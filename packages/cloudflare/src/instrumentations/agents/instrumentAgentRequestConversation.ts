import { type AgentInternals, setAgentConversationId } from './types';

/**
 * Correlates the AI spans of an HTTP-driven agent turn with a conversation id on the active scope.
 *
 * `onRequest` is the third unit of agent work, alongside chat turns and `@callable()` RPC: the
 * `agents` router sends every non-WebSocket request to it, which is how REST endpoints and webhooks
 * reach an agent.
 *
 * `agents` installs `onRequest` as an own property in the `Agent` constructor (as it does
 * `onMessage`), and we instrument after construction, so wrapping the own property is what the
 * router ends up calling. That own property is already `async`, and partyserver's `fetch` awaits it,
 * so returning a promise from this wrapper — to get the conversation id onto the scope before the
 * request handler creates any span — keeps the existing contract.
 */
export function instrumentAgentRequestConversation(obj: AgentInternals): void {
  const original = obj.onRequest;

  if (typeof original !== 'function') {
    return;
  }

  obj.onRequest = new Proxy(original, {
    async apply(target, thisArg: AgentInternals, args: unknown[]): Promise<unknown> {
      await setAgentConversationId(thisArg);

      return Reflect.apply(target, thisArg, args);
    },
  });
}
