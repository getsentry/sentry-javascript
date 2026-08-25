import type { IntegrationFn } from '../types/integration';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { captureSpan } from '../tracing/spans/captureSpan';
import { hasSpanStreamingEnabled } from '../tracing/spans/hasSpanStreamingEnabled';
import { SpanBuffer } from '../tracing/spans/spanBuffer';
import { debug } from '../utils/debug-logger';
import { spanIsSampled } from '../utils/spanUtils';

export const INTEGRATION_NAME = 'SpanStreaming' as const;

export const spanStreamingIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,

    setup(client) {
      if (!hasSpanStreamingEnabled(client)) {
        DEBUG_BUILD && debug.log(`[${INTEGRATION_NAME}] \`traceLifecycle\` is "static", skipping setup.`);
        return;
      }

      const buffer = new SpanBuffer(client);

      client.on('afterSpanEnd', span => {
        if (!spanIsSampled(span)) {
          return;
        }
        buffer.add(captureSpan(span, client));
      });

      // Lets runtimes flush a single trace eagerly (e.g. the Cloudflare SDK draining
      // a trace the moment its segment ends), without exposing the buffer itself.
      client.on('flushTraceSpans', traceId => {
        buffer.flush(traceId);
      });
    },
  };
}) satisfies IntegrationFn;
