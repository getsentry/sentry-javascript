import type { Span } from '@sentry/core';
import { browserPerformanceTimeOrigin } from '@sentry/core';
import { extractNetworkProtocol } from '@sentry-internal/browser-utils';

function getAbsoluteTime(time: number = 0): number {
  return ((browserPerformanceTimeOrigin() || performance.timeOrigin) + time) / 1000;
}

/**
 * Converts a PerformanceResourceTiming entry to span data for the resource span.
 *
 * @param resourceTiming
 * @returns An array where the first element is the attribute name and the second element is the attribute value.
 */
export function resourceTimingToSpanAttributes(
  resourceTiming: PerformanceResourceTiming,
): Array<Parameters<Span['setAttribute']>> {
  const timingSpanData: Array<Parameters<Span['setAttribute']>> = [];
  if (resourceTiming.nextHopProtocol != undefined) {
    const { name, version } = extractNetworkProtocol(resourceTiming.nextHopProtocol);
    timingSpanData.push(['network.protocol.version', version], ['network.protocol.name', name]);
  }
  if (!browserPerformanceTimeOrigin()) {
    return timingSpanData;
  }
  return [
    ...timingSpanData,
    ['http.request.redirect_start', getAbsoluteTime(resourceTiming.redirectStart)],
    ['http.request.fetch_start', getAbsoluteTime(resourceTiming.fetchStart)],
    ['http.request.domain_lookup_start', getAbsoluteTime(resourceTiming.domainLookupStart)],
    ['http.request.domain_lookup_end', getAbsoluteTime(resourceTiming.domainLookupEnd)],
    ['http.request.connect_start', getAbsoluteTime(resourceTiming.connectStart)],
    ['http.request.secure_connection_start', getAbsoluteTime(resourceTiming.secureConnectionStart)],
    ['http.request.connection_end', getAbsoluteTime(resourceTiming.connectEnd)],
    ['http.request.request_start', getAbsoluteTime(resourceTiming.requestStart)],
    ['http.request.response_start', getAbsoluteTime(resourceTiming.responseStart)],
    ['http.request.response_end', getAbsoluteTime(resourceTiming.responseEnd)],
  ];
}
