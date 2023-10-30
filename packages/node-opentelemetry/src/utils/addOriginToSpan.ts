import type { Span } from '@opentelemetry/api';
import { _INTERNAL } from '@sentry/opentelemetry';
import type { SpanOrigin } from '@sentry/types';

/** Adds an origin to an OTEL Span. */
export function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  _INTERNAL.addOriginToSpan(span, origin);
}
