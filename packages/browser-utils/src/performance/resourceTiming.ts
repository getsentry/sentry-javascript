import {
  HTTP_REQUEST_CONNECTION_END,
  HTTP_REQUEST_CONNECT_START,
  HTTP_REQUEST_DOMAIN_LOOKUP_END,
  HTTP_REQUEST_DOMAIN_LOOKUP_START,
  HTTP_REQUEST_FETCH_START,
  HTTP_REQUEST_REDIRECT_END,
  HTTP_REQUEST_REDIRECT_START,
  HTTP_REQUEST_REQUEST_START,
  HTTP_REQUEST_RESPONSE_END,
  HTTP_REQUEST_RESPONSE_START,
  HTTP_REQUEST_SECURE_CONNECTION_START,
  HTTP_REQUEST_TIME_TO_FIRST_BYTE,
  HTTP_REQUEST_WORKER_START,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
} from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { _INTERNAL_performanceTimeToSeconds } from '@sentry/core';
import { extractNetworkProtocol, msToSec } from './utils';

/**
 * Converts a PerformanceResourceTiming entry to span data for the resource span. Most importantly,
 * it converts the timing values from timestamps relative to the `performance.timeOrigin` to absolute timestamps
 * in seconds.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming#timestamps
 *
 * @param resourceTiming
 * @returns An array where the first element is the attribute name and the second element is the attribute value.
 */
export function resourceTimingToSpanAttributes(resourceTiming: PerformanceResourceTiming): SpanAttributes {
  const timingSpanData: SpanAttributes = {};
  // Checking for only `undefined` and `null` is intentional because it's
  // valid for `nextHopProtocol` to be an empty string.
  if (resourceTiming.nextHopProtocol != undefined) {
    const { name, version } = extractNetworkProtocol(resourceTiming.nextHopProtocol);
    timingSpanData[NETWORK_PROTOCOL_VERSION] = version;
    timingSpanData[NETWORK_PROTOCOL_NAME] = name;
  }

  if (_INTERNAL_performanceTimeToSeconds(resourceTiming.startTime) === undefined) {
    return timingSpanData;
  }

  // Use the origin from the request start for all timings, so the durations between them stay correct.
  const getAbsoluteTime = (time: number | undefined): number | undefined =>
    // falsy values should be preserved so that we can later on drop undefined values and
    // preserve 0 vals for cross-origin resources without proper `Timing-Allow-Origin` header.
    time ? _INTERNAL_performanceTimeToSeconds(time, resourceTiming.startTime) : time;

  return dropUndefinedKeysFromObject({
    ...timingSpanData,

    [HTTP_REQUEST_REDIRECT_START]: getAbsoluteTime(resourceTiming.redirectStart),
    [HTTP_REQUEST_REDIRECT_END]: getAbsoluteTime(resourceTiming.redirectEnd),

    [HTTP_REQUEST_WORKER_START]: getAbsoluteTime(resourceTiming.workerStart),

    [HTTP_REQUEST_FETCH_START]: getAbsoluteTime(resourceTiming.fetchStart),

    [HTTP_REQUEST_DOMAIN_LOOKUP_START]: getAbsoluteTime(resourceTiming.domainLookupStart),
    [HTTP_REQUEST_DOMAIN_LOOKUP_END]: getAbsoluteTime(resourceTiming.domainLookupEnd),

    [HTTP_REQUEST_CONNECT_START]: getAbsoluteTime(resourceTiming.connectStart),
    [HTTP_REQUEST_SECURE_CONNECTION_START]: getAbsoluteTime(resourceTiming.secureConnectionStart),
    [HTTP_REQUEST_CONNECTION_END]: getAbsoluteTime(resourceTiming.connectEnd),

    [HTTP_REQUEST_REQUEST_START]: getAbsoluteTime(resourceTiming.requestStart),

    [HTTP_REQUEST_RESPONSE_START]: getAbsoluteTime(resourceTiming.responseStart),
    [HTTP_REQUEST_RESPONSE_END]: getAbsoluteTime(resourceTiming.responseEnd),

    // For TTFB we actually want the relative time from timeOrigin to responseStart
    // This way, TTFB always measures the "first page load" experience.
    // see: https://web.dev/articles/ttfb#measure-resource-requests
    [HTTP_REQUEST_TIME_TO_FIRST_BYTE]:
      resourceTiming.responseStart != null ? msToSec(resourceTiming.responseStart) : undefined,
  });
}

/**
 * Remove properties with `undefined` as value from an object.
 * In contrast to `dropUndefinedKeys` in core this funciton only works on first-level
 * key-value objects and does not recursively go into object properties or arrays.
 */
function dropUndefinedKeysFromObject<T extends object>(attrs: T): Partial<T> {
  return Object.fromEntries(Object.entries(attrs).filter(([, value]) => value != null)) as Partial<T>;
}
