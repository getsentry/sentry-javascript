import type { Span, SpanTimeInput, TraceContext } from '@sentry/types';
import { dropUndefinedKeys, generateSentryTraceHeader, timestampInSeconds } from '@sentry/utils';
import { ensureTimestampInSeconds } from '../tracing/utils';

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

/**
 * Convert a span time input intp a timestamp in seconds.
 */
export function spanTimeInputToSeconds(input: SpanTimeInput | undefined): number {
  if (typeof input === 'number') {
    return ensureTimestampInSeconds(input);
  }

  if (Array.isArray(input)) {
    /**
     * Defines High-Resolution Time.
     *
     * The first number, HrTime[0], is UNIX Epoch time in seconds since 00:00:00 UTC on 1 January 1970.
     * The second number, HrTime[1], represents the partial second elapsed since Unix Epoch time represented by first number in nanoseconds.
     * For example, 2021-01-01T12:30:10.150Z in UNIX Epoch time in milliseconds is represented as 1609504210150.
     * The first number is calculated by converting and truncating the Epoch time in milliseconds to seconds:
     * HrTime[0] = Math.trunc(1609504210150 / 1000) = 1609504210.
     * The second number is calculated by converting the digits after the decimal point of the subtraction, (1609504210150 / 1000) - HrTime[0], to nanoseconds:
     * HrTime[1] = Number((1609504210.150 - HrTime[0]).toFixed(9)) * 1e9 = 150000000.
     * This is represented in HrTime format as [1609504210, 150000000].
     */
    return input[0] + input[1] / 1e9;
  }

  if (input instanceof Date) {
    return ensureTimestampInSeconds(input.getTime());
  }

  return timestampInSeconds();
}
