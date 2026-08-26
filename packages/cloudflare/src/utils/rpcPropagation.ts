import { stringMatchesSomePattern } from '@sentry/core';
import type { CloudflareOptions } from '../client';

const PROPAGATE_TO_NONE = () => false;

/**
 * Builds the per-binding predicate that decides whether a binding takes part in RPC trace
 * propagation.
 *
 * Callers only. Receivers continue an incoming trace whenever one arrives, so they have nothing to
 * match against.
 */
export function createRpcPropagationResolver(options: CloudflareOptions | undefined): (bindingName: string) => boolean {
  const bindings = options?.rpcTracePropagationBindings;

  if (!bindings?.length) {
    return PROPAGATE_TO_NONE;
  }

  // Strings must match a binding name exactly, without this, an entry of `DB` would also enable
  // propagation for a binding named `MY_DB`. Regular expressions still give pattern matching.
  return (bindingName: string) => stringMatchesSomePattern(bindingName, bindings, true);
}
