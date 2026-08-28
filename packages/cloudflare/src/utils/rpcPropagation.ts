import { stringMatchesSomePattern } from '@sentry/core';
import type { CloudflareOptions } from '../client';
import { getEffectiveRpcPropagation } from './rpcOptions';

const PROPAGATE_TO_NONE = (): boolean => false;
const PROPAGATE_TO_ALL = (): boolean => true;

/**
 * Builds the per-binding predicate that decides whether a binding takes part in RPC trace
 * propagation.
 *
 * `rpcTracePropagationBindings` wins over `enableRpcTracePropagation` as soon as it is set, an
 * allow list is the more precise statement. An empty list therefore propagates to nothing, even
 * next to `enableRpcTracePropagation: true`, which is how a receiver opts out of being a caller.
 * Only leaving it unset falls back to the boolean.
 *
 * Callers only. Receivers continue an incoming trace whenever `enableRpcTracePropagation` is on,
 * so they have nothing to match against.
 */
export function createRpcPropagationResolver(options: CloudflareOptions | undefined): (bindingName: string) => boolean {
  const bindings = options?.rpcTracePropagationBindings;

  if (bindings === undefined) {
    return options && getEffectiveRpcPropagation(options) ? PROPAGATE_TO_ALL : PROPAGATE_TO_NONE;
  }

  if (!bindings.length) {
    return PROPAGATE_TO_NONE;
  }

  // Strings must match a binding name exactly, without this, an entry of `DB` would also enable
  // propagation for a binding named `MY_DB`. Regular expressions still give pattern matching.
  return (bindingName: string) => stringMatchesSomePattern(bindingName, bindings, true);
}
