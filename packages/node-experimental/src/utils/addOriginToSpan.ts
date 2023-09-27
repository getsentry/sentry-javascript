// We are using the broader OtelSpan type from api here, as this is also what integrations etc. use
import type { Span as OtelSpan } from '@opentelemetry/api';
import type { SpanOrigin } from '@sentry/types';

import { OTEL_ATTR_ORIGIN } from '../constants';

/** Adds an origin to an OTEL Span. */
export function addOriginToOtelSpan(otelSpan: OtelSpan, origin: SpanOrigin): void {
  otelSpan.setAttribute(OTEL_ATTR_ORIGIN, origin);
}
