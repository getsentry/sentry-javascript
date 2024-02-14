import type { Scope } from '@sentry/types';
import { getCurrentHub } from './hub';
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
  // eslint-disable-next-line deprecation/deprecation
  return getCurrentHub().getScope();
}

/**
 * Get the currently active isolation scope.
 * The isolation scope is active for the current exection context.
 */
export function getIsolationScope(): Scope {
  // eslint-disable-next-line deprecation/deprecation
  return getCurrentHub().getIsolationScope();
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
