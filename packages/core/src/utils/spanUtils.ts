import type { Span, TraceContext } from '@sentry/types';
import { dropUndefinedKeys, generateSentryTraceHeader } from '@sentry/utils';

/**
 * Convert a span to a trace context, which can be sent as the `trace` context in an event.
 */
export function spanToTraceContext(span: Span): TraceContext {
  const { data, description, op, parent_span_id, span_id, status, tags, trace_id, origin } = span.toJSON();

  return dropUndefinedKeys({
    data,
    description,
    op,
    parent_span_id,
    span_id,
    status,
    tags,
    trace_id,
    origin,
  });
}

/**
 * Convert a Span to a Sentry trace header.
 */
export function spanToTraceHeader(span: Span): string {
  return generateSentryTraceHeader(span.traceId, span.spanId, span.sampled);
}
