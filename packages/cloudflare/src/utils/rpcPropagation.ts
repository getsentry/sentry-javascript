import { stringMatchesSomePattern } from '@sentry/core';
import type { CloudflareOptions } from '../client';

const PROPAGATE_TO_NONE = () => false;
const PROPAGATE_TO_ALL = () => true;

/**
 * Builds the per-binding predicate that decides whether a binding takes part in RPC trace
 * propagation.
 */
export function createRpcPropagationResolver(options: CloudflareOptions | undefined): (bindingName: string) => boolean {
  const value: CloudflareOptions['enableRpcTracePropagation'] | undefined = options?.enableRpcTracePropagation;

  if (value === true) {
    return PROPAGATE_TO_ALL;
  }

  if (!Array.isArray(value) || !value.length) {
    return PROPAGATE_TO_NONE;
  }

  // Strings must match a binding name exactly, without this, an entry of `DB` would also enable
  // propagation for a binding named `MY_DB`. Regular expressions still give pattern matching.
  return (bindingName: string) => stringMatchesSomePattern(bindingName, value, true);
}
