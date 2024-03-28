import { context } from '@opentelemetry/api';
import { getScopesFromContext } from '@sentry/opentelemetry';
import type { Scope } from '@sentry/types';

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
