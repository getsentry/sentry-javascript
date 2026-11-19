import { defineIntegration, getActiveSpan, getTraceData, spanIsSampled } from '@sentry/core';
import type { TraceContext } from '@solidjs/web';
import { OBSERVE } from 'solid-js';

const INTEGRATION_NAME = 'SolidServerTracePropagation';

/**
 * Hands Sentry's trace to Solid's runtime on observe and dev builds. The runtime then sends `sentry-trace` and
 * `baggage` to the browser on every response, as `Server-Timing` entries and `<meta>` tags, so the pageload
 * continues the server's trace. Production builds have no trace provider: there, `init` adds the `Server-Timing`
 * header to document responses itself.
 */
export const solidServerTracePropagationIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      OBSERVE?.server.trace?.provide((): Partial<TraceContext> | undefined => {
        const span = getActiveSpan();
        if (!span) {
          return undefined;
        }

        const { traceId, spanId } = span.spanContext();
        const traceData = getTraceData();
        const entries: Record<string, string> = {};
        if (traceData['sentry-trace']) {
          entries['sentry-trace'] = traceData['sentry-trace'];
        }
        if (traceData.baggage) {
          entries.baggage = traceData.baggage;
        }

        return { traceId, spanId, sampled: spanIsSampled(span), entries };
      });
    },
  };
});
