import { getTraceData } from '@sentry/core';

/**
 * Sets Server-Timing response headers for trace propagation to the client.
 * The browser SDK reads these via the Performance API to connect pageload traces.
 */
export function setServerTimingHeaders(response: unknown, _event: unknown): void {
  if (response && typeof response === 'object' && 'headers' in response) {
    const responseObj = response as Response;
    const traceData = getTraceData();

    if (traceData['sentry-trace']) {
      responseObj.headers.append('Server-Timing', `sentry-trace;desc="${traceData['sentry-trace']}"`);
    }
    if (traceData.baggage) {
      responseObj.headers.append('Server-Timing', `baggage;desc="${traceData.baggage}"`);
    }
  }
}
