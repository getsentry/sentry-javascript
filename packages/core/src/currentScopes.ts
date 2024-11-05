import type { Scope } from '@sentry/types';
import type { Client } from '@sentry/types';
import { getGlobalSingleton } from '@sentry/utils';
import { getAsyncContextStrategy } from './asyncContext';
import { getMainCarrier } from './carrier';
import { Scope as ScopeClass } from './scope';

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
 * The isolation scope is active for the current execution context.
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
  return getGlobalSingleton('globalScope', () => new ScopeClass());
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
 */
export function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T;
/**
 * Set the provided isolation scope as active in the given callback. If no
 * async context strategy is set, the isolation scope and the current scope will not be forked (this is currently the
 * case, for example, in the browser).
 *
 * Usage of this function in environments without async context strategy is discouraged and may lead to unexpected behaviour.
 *
 * This function is intended for Sentry SDK and SDK integration development. It is not recommended to be used in "normal"
 * applications directly because it comes with pitfalls. Use at your own risk!
 *
 * If you pass in `undefined` as a scope, it will fork a new isolation scope, the same as if no scope is passed.
 */
export function withIsolationScope<T>(isolationScope: Scope | undefined, callback: (isolationScope: Scope) => T): T;
/**
 * Either creates a new active isolation scope, or sets the given isolation scope as active scope in the given callback.
 */
export function withIsolationScope<T>(
  ...rest:
    | [callback: (isolationScope: Scope) => T]
    | [isolationScope: Scope | undefined, callback: (isolationScope: Scope) => T]
): T {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);

  // If a scope is defined, we want to make this the active scope instead of the default one
  if (rest.length === 2) {
    const [isolationScope, callback] = rest;

    if (!isolationScope) {
      return acs.withIsolationScope(callback);
    }

    return acs.withSetIsolationScope(isolationScope, callback);
  }

  return acs.withIsolationScope(rest[0]);
}

/**
 * Get the currently active client.
 */
export function getClient<C extends Client>(): C | undefined {
  return getCurrentScope().getClient<C>();
}
