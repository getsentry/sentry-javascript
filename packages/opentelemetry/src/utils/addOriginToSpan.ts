import type { Span } from '@opentelemetry/api';
import type { SpanOrigin } from '@sentry/types';

import { InternalSentrySemanticAttributes } from '../semanticAttributes';

/** Adds an origin to an OTEL Span. */
export function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(InternalSentrySemanticAttributes.ORIGIN, origin);
}
