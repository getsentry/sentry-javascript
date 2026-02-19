import { getTraceData } from '@sentry/core';
import type { TracingRequestEvent as H3TracingRequestEvent } from 'h3/tracing';

/**
 * Sets Server-Timing response headers for trace propagation to the client.
 * The browser SDK reads these via the Performance API to connect pageload traces.
 */
export function setServerTimingHeaders(event: H3TracingRequestEvent['event']): void {
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
