import type { Span } from '@opentelemetry/api';
import type { SpanOrigin } from '@sentry/types';

import { OTEL_ATTR_ORIGIN } from '../constants';

/** Adds an origin to an OTEL Span. */
export function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(OTEL_ATTR_ORIGIN, origin);
}
