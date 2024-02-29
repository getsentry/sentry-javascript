import type { Context } from '@opentelemetry/api';
import type { Hub, PropagationContext, Scope } from '@sentry/types';

import {
  SENTRY_HUB_CONTEXT_KEY,
  SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY,
  SENTRY_SCOPES_CONTEXT_KEY,
} from '../constants';
import type { CurrentScopes } from '../types';

const SCOPE_CONTEXT_MAP = new WeakMap<Scope, Context>();

/**
 * Try to get the Propagation Context from the given OTEL context.
 * This requires the SentryPropagator to be registered.
 */
export function getPropagationContextFromContext(context: Context): PropagationContext | undefined {
  return context.getValue(SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY) as PropagationContext | undefined;
}

/**
 * Set a Propagation Context on an OTEL context..
 * This will return a forked context with the Propagation Context set.
 */
export function setPropagationContextOnContext(context: Context, propagationContext: PropagationContext): Context {
  return context.setValue(SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY, propagationContext);
}

/**
 * Try to get the Hub from the given OTEL context.
 * This requires a Context Manager that was wrapped with getWrappedContextManager.
 */
export function getHubFromContext(context: Context): Hub | undefined {
  return context.getValue(SENTRY_HUB_CONTEXT_KEY) as Hub | undefined;
}

/**
 * Set a Hub on an OTEL context..
 * This will return a forked context with the Propagation Context set.
 */
export function setHubOnContext(context: Context, hub: Hub): Context {
  return context.setValue(SENTRY_HUB_CONTEXT_KEY, hub);
}

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
 */
export function setContextOnScope(scope: Scope, context: Context): void {
  SCOPE_CONTEXT_MAP.set(scope, context);
}

/**
 * Get the context related to a scope.
 * TODO v8: Use this for the `trace` functions.
 * */
export function getContextFromScope(scope: Scope): Context | undefined {
  return SCOPE_CONTEXT_MAP.get(scope);
}
