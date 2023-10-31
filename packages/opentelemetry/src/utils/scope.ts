import { context } from '@opentelemetry/api';
import type { Scope } from '@sentry/types';

import { getCurrentHub, getGlobalHub } from '../custom/hub';
import { getRootScopeFromContext, setForceRootScopeOnContext } from './contextData';

/**
 * Get the currently active scope.
 */
export function getCurrentScope(): Scope {
  return getCurrentHub().getScope();
}

/**
 * Get the currently active root scope,
 * or fall back to the active scope if none is available.
 */
export function getCurrentRootScope(): Scope {
  const rootScope = getRootScopeFromContext(context.active());

  return rootScope || getCurrentScope();
}

/**
 * Get the global scope.
 */
export function getGlobalScope(): Scope {
  return getGlobalHub().getScope();
}

/**
 * Creates a new scope with and executes the given operation within.
 * The scope is automatically removed once the operation
 * finishes or throws.
 */
export function withScope(callback: (scope: Scope) => void): void {
  context.with(context.active(), () => {
    const scope = getCurrentScope();
    callback(scope);
  });
}

/**
 * Creates a new root scope with and executes the given operation within.
 * The scope is automatically removed once the operation
 * finishes or throws.
 */
export function withRootScope(callback: (scope: Scope) => void): void {
  context.with(setForceRootScopeOnContext(context.active()), () => {
    const scope = getCurrentScope();
    callback(scope);
  });
}
