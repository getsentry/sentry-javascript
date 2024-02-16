import type { Scope } from '@sentry/types';
import type { Client } from '@sentry/types';
import { getMainCarrier } from './asyncContext';
import { getAsyncContextStrategy } from './hub';
import { Scope as ScopeClass } from './scope';

/**
 * The global scope is kept in this module.
 * When accessing it, we'll make sure to set one if none is currently present.
 */
let globalScope: Scope | undefined;

/**
 * Get the currently active scope.
 */
export function getCurrentScope(): Scope {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  return acs.getCurrentScope();
}

/**
 * Get the currently active isolation scope.
 * The isolation scope is active for the current exection context.
 */
export function getIsolationScope(): Scope {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  return acs.getIsolationScope();
}

/**
 * Get the global scope.
 * This scope is applied to _all_ events.
 */
export function getGlobalScope(): Scope {
  if (!globalScope) {
    globalScope = new ScopeClass();
  }

  return globalScope;
}

/**
 * This is mainly needed for tests.
 * DO NOT USE this, as this is an internal API and subject to change.
 * @hidden
 */
export function setGlobalScope(scope: Scope | undefined): void {
  globalScope = scope;
}

/**
 * Creates a new scope with and executes the given operation within.
 * The scope is automatically removed once the operation
 * finishes or throws.
 */
export function withScope<T>(callback: (scope: Scope) => T): T;
/**
 * Set the given scope as the active scope in the callback.
 */
export function withScope<T>(scope: Scope | undefined, callback: (scope: Scope) => T): T;
/**
 * Either creates a new active scope, or sets the given scope as active scope in the given callback.
 */
export function withScope<T>(
  ...rest: [callback: (scope: Scope) => T] | [scope: Scope | undefined, callback: (scope: Scope) => T]
): T {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);

  // If a scope is defined, we want to make this the active scope instead of the default one
  if (rest.length === 2) {
    const [scope, callback] = rest;

    if (!scope) {
      return acs.withScope(callback);
    }

    return acs.withSetScope(scope, callback);
  }

  return acs.withScope(rest[0]);
}

/**
 * Attempts to fork the current isolation scope and the current scope based on the current async context strategy. If no
 * async context strategy is set, the isolation scope and the current scope will not be forked (this is currently the
 * case, for example, in the browser).
 *
 * Usage of this function in environments without async context strategy is discouraged and may lead to unexpected behaviour.
 *
 * This function is intended for Sentry SDK and SDK integration development. It is not recommended to be used in "normal"
 * applications directly because it comes with pitfalls. Use at your own risk!
 *
 * @param callback The callback in which the passed isolation scope is active. (Note: In environments without async
 * context strategy, the currently active isolation scope may change within execution of the callback.)
 * @returns The same value that `callback` returns.
 */
export function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  return acs.withIsolationScope(callback);
}

/**
 * Runs the supplied callback in its own async context. Async Context strategies are defined per SDK.
 *
 * @param callback The callback to run in its own async context
 * @param options Options to pass to the async context strategy
 * @returns The result of the callback
 *
 * @deprecated Use `Sentry.withScope()` instead.
 */
export function runWithAsyncContext<T>(callback: () => T): T {
  return withScope(() => callback());
}

/**
 * Get the currently active client.
 */
export function getClient<C extends Client>(): C | undefined {
  return getCurrentScope().getClient<C>();
}
