import { stringMatchesSomePattern } from '@sentry/core';
import type { CloudflareOptions, RpcTracePropagationOption } from '../client';

const PROPAGATE_TO_NONE = (): boolean => false;
const PROPAGATE_TO_ALL = (): boolean => true;

/**
 * Builds the per-binding predicate that decides whether a binding takes part in RPC trace
 * propagation.
 *
 * Built once per `instrumentEnv()` call so the `env` proxy's `get` trap only pays for the match.
 *
 * @param options - The resolved SDK options, or `undefined` when none are available.
 */
export function createRpcPropagationResolver(options: CloudflareOptions | undefined): (bindingName: string) => boolean {
  const value: RpcTracePropagationOption | undefined = options?.enableRpcTracePropagation;

  if (value === true) {
    return PROPAGATE_TO_ALL;
  }

  // `false`/unset opts out, which also discards any binding names the Vite plugin merged in.
  if (!Array.isArray(value) || !value.length) {
    return PROPAGATE_TO_NONE;
  }

  // Strings must match a binding name exactly — without this, an entry of `DB` would also enable
  // propagation for a binding named `MY_DB`. Regular expressions still give pattern matching.
  return (bindingName: string) => stringMatchesSomePattern(bindingName, value, true);
}
