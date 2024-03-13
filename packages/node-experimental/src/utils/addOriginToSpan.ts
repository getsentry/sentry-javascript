import type { Span } from '@opentelemetry/api';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import type { SpanOrigin } from '@sentry/types';

/** Adds an origin to an OTEL Span. */
export function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, origin);
}
