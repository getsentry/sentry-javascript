import type { Context } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { SENTRY_SCOPES_CONTEXT_KEY } from '../constants';
import type { CurrentScopes } from '../types';

/**
 * Try to get the current scopes from the given OTEL context.
 * This requires a Context Manager that was wrapped with getWrappedContextManager.
 */
export function getScopesFromContext(context: Context): CurrentScopes | undefined {
  return context.getValue(SENTRY_SCOPES_CONTEXT_KEY) as CurrentScopes | undefined;
}

/**
 * Set the current scopes on an OTEL context.
 * This will return a forked context with the Propagation Context set.
 */
export function setScopesOnContext(context: Context, scopes: CurrentScopes): Context {
  return context.setValue(SENTRY_SCOPES_CONTEXT_KEY, scopes);
}

const SCOPE_TO_CONTEXT_MAP = new WeakMap<Scope, Context>();

/**
 * Set the context on the scope so we can later look it up.
 * We need this to get the context from the scope in the `trace` functions.
 */
export function setContextOnScope(scope: Scope, context: Context): void {
  SCOPE_TO_CONTEXT_MAP.set(scope, context);
}

/**
 * Get the context related to a scope.
 */
export function getContextFromScope(scope: Scope): Context | undefined {
  return SCOPE_TO_CONTEXT_MAP.get(scope);
}
