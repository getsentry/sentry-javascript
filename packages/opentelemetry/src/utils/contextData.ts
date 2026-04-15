import type { Context } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { addNonEnumerableProperty, derefWeakRef, makeWeakRef, type MaybeWeakRef } from '@sentry/core';
import { SENTRY_SCOPES_CONTEXT_KEY } from '../constants';
import type { CurrentScopes } from '../types';

const SCOPE_CONTEXT_FIELD = '_scopeContext';

type ScopeWithContext = Scope & {
  [SCOPE_CONTEXT_FIELD]?: MaybeWeakRef<Context>;
};

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

/**
 * Set the context on the scope so we can later look it up.
 * We need this to get the context from the scope in the `trace` functions.
 *
 * We use WeakRef to avoid a circular reference between the scope and the context.
 * The context holds scopes (via SENTRY_SCOPES_CONTEXT_KEY), and if the scope held
 * a strong reference back to the context, neither could be garbage collected even
 * when the context is no longer reachable from application code (e.g., after a
 * request completes but pooled connections retain patched callbacks).
 */
export function setContextOnScope(scope: Scope, context: Context): void {
  addNonEnumerableProperty(scope, SCOPE_CONTEXT_FIELD, makeWeakRef(context));
}

/**
 * Get the context related to a scope.
 * Returns undefined if the context has been garbage collected (when WeakRef is used).
 */
export function getContextFromScope(scope: Scope): Context | undefined {
  return derefWeakRef((scope as ScopeWithContext)[SCOPE_CONTEXT_FIELD]);
}
