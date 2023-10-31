import type { Context } from '@opentelemetry/api';
import type { Hub, PropagationContext, Scope } from '@sentry/types';

import {
  SENTRY_FORCE_ROOT_SCOPE_CONTEXT_KEY,
  SENTRY_HUB_CONTEXT_KEY,
  SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY,
  SENTRY_ROOT_SCOPE_CONTEXT_KEY,
} from '../constants';

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
 * Try to get the hub from the given OTEL context.
 * This requires a Context Manager that was wrapped with getWrappedContextManager.
 */
export function getHubFromContext(context: Context): Hub | undefined {
  return context.getValue(SENTRY_HUB_CONTEXT_KEY) as Hub | undefined;
}

/**
 * Set a hub on an OTEL context.
 * This will return a forked context with the Propagation Context set.
 */
export function setHubOnContext(context: Context, hub: Hub): Context {
  return context.setValue(SENTRY_HUB_CONTEXT_KEY, hub);
}

/**
 * Try to get the root scope from the given OTEL context.
 * This requires a Context Manager that was wrapped with getWrappedContextManager.
 */
export function getRootScopeFromContext(context: Context): Scope | undefined {
  return context.getValue(SENTRY_ROOT_SCOPE_CONTEXT_KEY) as Scope | undefined;
}

/**
 * Set a root scope on an OTEL context.
 * This will return a forked context with the Propagation Context set.
 */
export function setRootScopeOnContext(context: Context, scope: Scope): Context {
  return context.setValue(SENTRY_ROOT_SCOPE_CONTEXT_KEY, scope);
}

/**
 * If this context should be forced to generate a new root scope.
 * This requires a Context Manager that was wrapped with getWrappedContextManager.
 */
export function getForceRootScopeFromContext(context: Context): boolean {
  return !!context.getValue(SENTRY_FORCE_ROOT_SCOPE_CONTEXT_KEY);
}

/**
 * Set a flag on the context to ensure we set the new scope as root scope.
 * This will return a forked context with the Propagation Context set.
 */
export function setForceRootScopeOnContext(context: Context, force = true): Context {
  return context.setValue(SENTRY_FORCE_ROOT_SCOPE_CONTEXT_KEY, force);
}

/**
 * Clear the force root scope flag on the context.
 * This will return a forked context with the Propagation Context set.
 */
export function clearForceRootScopeOnContext(context: Context): Context {
  return context.deleteValue(SENTRY_FORCE_ROOT_SCOPE_CONTEXT_KEY);
}
