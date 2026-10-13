import { getTraceData } from '@sentry/core';
import type { H3Event } from 'nitro/h3';

/**
 * Sets Server-Timing response headers for trace propagation to the client.
 * The browser SDK reads these via the Performance API to connect pageload traces.
 */
export function setServerTimingHeaders(event: H3Event): void {
  if (event.context._sentryServerTimingSet) {
    return;
  }

  const headers = event.res?.headers;
  if (!headers) {
    return;
  }

  const traceData = getTraceData();
  if (traceData['sentry-trace']) {
    headers.append('Server-Timing', `sentry-trace;desc="${traceData['sentry-trace']}"`);
  }
  if (traceData.baggage) {
    headers.append('Server-Timing', `baggage;desc="${traceData.baggage}"`);
  }

  event.context._sentryServerTimingSet = true;
}
