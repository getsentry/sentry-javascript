import type { Context } from '@opentelemetry/api';
import type { Hub, PropagationContext } from '@sentry/types';

import { SENTRY_HUB_CONTEXT_KEY, SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY } from '../constants';

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
