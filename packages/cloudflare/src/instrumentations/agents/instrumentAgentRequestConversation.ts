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
 * router ends up calling.
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
