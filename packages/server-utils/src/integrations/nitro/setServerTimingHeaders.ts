import { getTraceData, GLOBAL_OBJ } from '@sentry/core';
import * as diagnosticsChannel from '../../utils/diagnosticsChannel';
import type { H3TracingRequestEvent, NitroH3Event } from './nitroTypes';

const globalWithServerTiming = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __SENTRY_NITRO_SERVER_TIMING_INSTRUMENTED__: boolean;
};

/**
 * Subscribes to the h3 request tracing channel to set Server-Timing trace headers on every response.
 *
 * This is deliberately independent of span sampling: `getTraceData()` returns valid trace
 * propagation data even in tracing-without-performance mode, and the browser SDK reads these headers
 * (via the Performance API) to connect a pageload to the backend trace regardless of whether the
 * server records spans. Span creation itself lives in the separate `nitroIntegration`, which only
 * activates when tracing is enabled.
 */
export function captureServerTimingHeaders(): void {
  if (globalWithServerTiming.__SENTRY_NITRO_SERVER_TIMING_INSTRUMENTED__) {
    return;
  }

  // Bail if this is not available (e.g. Node without tracing channel support)
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }

  diagnosticsChannel.tracingChannel<H3TracingRequestEvent>('h3.request').start.subscribe(message => {
    setServerTimingHeaders((message as H3TracingRequestEvent).event);
  });

  globalWithServerTiming.__SENTRY_NITRO_SERVER_TIMING_INSTRUMENTED__ = true;
}

/**
 * Sets Server-Timing response headers for trace propagation to the client.
 * The browser SDK reads these via the Performance API to connect pageload traces.
 */
function setServerTimingHeaders(event: NitroH3Event): void {
  if (event.context?._sentryServerTimingSet) {
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

  if (event.context) {
    event.context._sentryServerTimingSet = true;
  }
}
