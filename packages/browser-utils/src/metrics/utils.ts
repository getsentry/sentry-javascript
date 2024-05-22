import type { SentrySpan } from '@sentry/core';
import { spanToJSON, startInactiveSpan, withActiveSpan } from '@sentry/core';
import type { Span, SpanTimeInput, StartSpanOptions } from '@sentry/types';
import { WINDOW } from '../types';

/**
 * Checks if a given value is a valid measurement value.
 */
export function isMeasurementValue(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Helper function to start child on transactions. This function will make sure that the transaction will
 * use the start timestamp of the created child span if it is earlier than the transactions actual
 * start timestamp.
 */
export function startAndEndSpan(
  parentSpan: Span,
  startTimeInSeconds: number,
  endTime: SpanTimeInput,
  { ...ctx }: StartSpanOptions,
): Span | undefined {
  const parentStartTime = spanToJSON(parentSpan).start_timestamp;
  if (parentStartTime && parentStartTime > startTimeInSeconds) {
    // We can only do this for SentrySpans...
    if (typeof (parentSpan as Partial<SentrySpan>).updateStartTime === 'function') {
      (parentSpan as SentrySpan).updateStartTime(startTimeInSeconds);
    }
  }

  // The return value only exists for tests
  return withActiveSpan(parentSpan, () => {
    const span = startInactiveSpan({
      startTime: startTimeInSeconds,
      ...ctx,
    });

    if (span) {
      span.end(endTime);
    }

    return span;
  });
}

/** Get the browser performance API. */
export function getBrowserPerformanceAPI(): Performance | undefined {
  // @ts-expect-error we want to make sure all of these are available, even if TS is sure they are
  return WINDOW && WINDOW.addEventListener && WINDOW.performance;
}

/**
 * Converts from milliseconds to seconds
 * @param time time in ms
 */
export function msToSec(time: number): number {
  return time / 1000;
}
