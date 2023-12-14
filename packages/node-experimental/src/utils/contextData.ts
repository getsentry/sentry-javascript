import type { Context } from '@opentelemetry/api';
import { createContextKey } from '@opentelemetry/api';

import type { CurrentScopes } from '../sdk/types';

export const SENTRY_SCOPES_CONTEXT_KEY = createContextKey('sentry_scopes');

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
