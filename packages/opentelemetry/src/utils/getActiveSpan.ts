import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { getContextFromScope } from './contextData';

/**
 * Returns the currently active span.
 */
export function getActiveSpan(scope?: Scope): Span | undefined {
  if (!scope) {
    return trace.getActiveSpan();
  }

  const ctx = getContextFromScope(scope);
  if (ctx) {
    return trace.getSpan(ctx);
  }

  // If ctx cannot be picked from scope, return undefined
  return undefined;
}
