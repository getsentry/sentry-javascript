import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { Span } from '@opentelemetry/api';
import type { SpanOrigin } from '@sentry/core';

/** Adds an origin to an OTEL Span. */
export function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(SENTRY_ORIGIN, origin);
}
