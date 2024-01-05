import type { Context } from '@opentelemetry/api';
import { createContextKey } from '@opentelemetry/api';
import type { Scope } from '@sentry/types';

import type { CurrentScopes } from '../sdk/types';

export const SENTRY_SCOPES_CONTEXT_KEY = createContextKey('sentry_scopes');

const SCOPE_CONTEXT_MAP = new WeakMap<Scope, Context>();

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
  // So we can look up the context from the scope later
  SCOPE_CONTEXT_MAP.set(scopes.scope, context);
  SCOPE_CONTEXT_MAP.set(scopes.isolationScope, context);

  return context.setValue(SENTRY_SCOPES_CONTEXT_KEY, scopes);
}

/**
 * Get the context related to a scope.
 * TODO v8: Use this for the `trace` functions.
 * */
export function getContextFromScope(scope: Scope): Context | undefined {
  return SCOPE_CONTEXT_MAP.get(scope);
}
