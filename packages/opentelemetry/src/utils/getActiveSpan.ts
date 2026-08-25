import type { Span } from '@opentelemetry/api';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { getContextFromScope } from './contextData';

/**
 * Returns the currently active span, or the active span of the given scope's context.
 *
 * Spans with an invalid span context (e.g. a malformed incoming trace/span id put on the context by
 * a propagator) are ignored, matching the OTel SDK tracer, so consumers start a fresh trace instead
 * of continuing a broken one.
 */
export function getActiveSpan(scope?: Scope): Span | undefined {
  const span = scope ? getSpanFromScope(scope) : trace.getActiveSpan();
  return span && isSpanContextValid(span.spanContext()) ? span : undefined;
}

function getSpanFromScope(scope: Scope): Span | undefined {
  const ctx = getContextFromScope(scope);
  // If no context can be picked from the scope, there is no span for it
  return ctx ? trace.getSpan(ctx) : undefined;
}
