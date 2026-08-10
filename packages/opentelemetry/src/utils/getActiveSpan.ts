import type { Span } from '@opentelemetry/api';
import { isSpanContextValid, trace } from '@opentelemetry/api';

/**
 * Returns the currently active span.
 *
 * Spans with an invalid span context (e.g. a malformed incoming trace/span id put on the context by
 * a propagator) are ignored, matching the OTel SDK tracer, so consumers start a fresh trace instead
 * of continuing a broken one.
 */
export function getActiveSpan(): Span | undefined {
  const span = trace.getActiveSpan();
  return span && isSpanContextValid(span.spanContext()) ? span : undefined;
}
