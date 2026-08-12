import type { SentrySpan, Span, SpanTimeInput, StartSpanOptions } from '@sentry/core';
import { spanToStaticSpanJSON, startInactiveSpan, withActiveSpan } from '@sentry/core';
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
  const parentStartTime = spanToStaticSpanJSON(parentSpan).start_timestamp;
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
  return WINDOW.addEventListener && WINDOW.performance;
}

/**
 * Converts from milliseconds to seconds
 * @param time time in ms
 */
export function msToSec(time: number): number {
  return time / 1000;
}

/**
 * Converts ALPN protocol ids to name and version.
 *
 * (https://www.iana.org/assignments/tls-extensiontype-values/tls-extensiontype-values.xhtml#alpn-protocol-ids)
 * @param nextHopProtocol PerformanceResourceTiming.nextHopProtocol
 */
export function extractNetworkProtocol(nextHopProtocol: string): { name: string; version: string } {
  let name = 'unknown';
  let version = 'unknown';
  let _name = '';
  for (const char of nextHopProtocol) {
    // http/1.1 etc.
    if (char === '/') {
      [name, version] = nextHopProtocol.split('/') as [string, string];
      break;
    }
    // h2, h3 etc.
    if (!isNaN(Number(char))) {
      name = _name === 'h' ? 'http' : _name;
      version = nextHopProtocol.split(_name)[1] as string;
      break;
    }
    _name += char;
  }
  if (_name === nextHopProtocol) {
    // webrtc, ftp, etc.
    name = _name;
  }
  return { name, version };
}

/**
 * Generic support check for web vitals
 */
export function supportsWebVital(entryType: 'layout-shift' | 'largest-contentful-paint'): boolean {
  try {
    return PerformanceObserver.supportedEntryTypes.includes(entryType);
  } catch {
    return false;
  }
}
