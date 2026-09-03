import { getDefaultIsolationScope, getIsolationScope, type Scope, withIsolationScope } from '@sentry/core';
import type { ExecutionContextCompat } from '../executionContext';
import { setInvocationState } from './invocationContext';

/**
 * Runs `callback` on the isolation scope for the current invocation.
 *
 * An instrumented handler is either the entry point of an invocation or reentrant — reached from
 * another instrumented handler already serving the same invocation (a Durable Object method calling
 * its own `fetch`, an RPC method reaching a sibling method). Only the entry point may fork:
 *
 * - Forking at the entry point is mandatory. `setUser`/`setTag` write to the isolation scope, and a
 *   Durable Object's isolation scope outlives the invocation that touched it, so without a fork one
 *   invocation's user and tags reappear on the next invocation's events in the same isolate.
 *   Forking clones, so request data set by an enclosing wrapper is still inherited.
 * - Forking again when reentrant would be wrong. Everything below the entry point is one logical
 *   unit of work: a nested call must see what the caller set and be able to add to it, the way it
 *   would if the SDK were not wrapping it at all.
 *
 * The AsyncLocalStorage strategy hands the default isolation scope back whenever no invocation is in
 * flight, and a forked one while inside `withIsolationScope`. Reference-comparing against the default
 * is therefore enough to tell the two cases apart. The stack fallback does not fork, so it reports the
 * default scope even inside an invocation; there the fork degrades to a no-op, which the stack strategy
 * tolerates. This matches the approach used by `patchEventHandler` in Nuxt.
 */
export function withInvocationIsolationScope<T>(callback: (scope: Scope) => T, context?: ExecutionContextCompat): T {
  const isolationScope = getIsolationScope();

  const isEntryPoint = isolationScope === getDefaultIsolationScope();
  const newIsolationScope = isEntryPoint ? isolationScope.clone() : isolationScope;

  if (isEntryPoint) {
    setInvocationState(newIsolationScope, { ctx: context });
  }

  return withIsolationScope(newIsolationScope, () => callback(newIsolationScope));
}
