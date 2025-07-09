import type { Span } from '@opentelemetry/api';
import type { SpanOrigin } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';

/** Adds an origin to an OTEL Span. */
export function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, origin);
}
