// We are using the broader OtelSpan type from api here, as this is also what integrations etc. use
import type { Span as OtelSpan } from '@opentelemetry/api';
import { _INTERNAL_getSentrySpan } from '@sentry/opentelemetry-node';
import type { SpanOrigin } from '@sentry/types';

/** Adds an origin to an OTEL Span. */
export function addOriginToOtelSpan(otelSpan: OtelSpan, origin: SpanOrigin): void {
  const sentrySpan = _INTERNAL_getSentrySpan(otelSpan.spanContext().spanId);
  if (!sentrySpan) {
    return;
  }

  sentrySpan.origin = origin;
}
