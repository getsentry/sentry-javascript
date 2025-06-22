import { context } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { getScopesFromContext } from '@sentry/opentelemetry';

/**
 * Update the active isolation scope.
 * Should be used with caution!
 */
export function setIsolationScope(isolationScope: Scope): void {
  const scopes = getScopesFromContext(context.active());
  if (scopes) {
    scopes.isolationScope = isolationScope;
  }
}
