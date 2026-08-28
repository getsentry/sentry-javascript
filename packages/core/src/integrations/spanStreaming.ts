import type { IntegrationFn } from '../types/integration';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { captureSpan } from '../tracing/spans/captureSpan';
import { hasSpanStreamingEnabled } from '../tracing/spans/hasSpanStreamingEnabled';
import { SpanBuffer } from '../tracing/spans/spanBuffer';
import { debug } from '../utils/debug-logger';
import { spanIsSampled } from '../utils/spanUtils';
import { safeUnref } from '../utils/timer';

export const INTEGRATION_NAME = 'SpanStreaming' as const;

interface SpanStreamingOptions {
  /**
   * When enabled, a trace is flushed shortly after its segment span ends, rather than relying solely
   * on the buffer's timeout/size thresholds or an explicit `flushTraceSpans` emission.
   *
   * This is used in the browser, where we never know when the page is closed or navigated away from,
   * so spans must be sent timely.
   *
   * @default false
   */
  flushOnSegmentEnd?: boolean;
}

export const spanStreamingIntegration = defineIntegration((options: SpanStreamingOptions = {}) => {
  return {
    name: INTEGRATION_NAME,

    setup(client) {
      if (!hasSpanStreamingEnabled(client)) {
        DEBUG_BUILD && debug.log(`[${INTEGRATION_NAME}] \`traceLifecycle\` is "static", skipping setup.`);
        return;
      }

      const buffer = new SpanBuffer(client);

      client.on('afterSpanEnd', span => {
        // Negatively sampled spans must not be captured.
        // This happens because OTel and we create non-recording spans for negatively sampled spans
        // that go through the same life cycle as recording spans.
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

      if (options.flushOnSegmentEnd) {
        // In addition to capturing the span, we also flush the trace when the segment
        // span ends to ensure things are sent timely. We never know when the browser
        // is closed, users navigate away, etc.
        client.on('afterSegmentSpanEnd', segmentSpan => {
          const traceId = segmentSpan.spanContext().traceId;
          // `safeUnref` so an enabled `flushOnSegmentEnd` on a server runtime can't keep the
          // process alive until the timer fires (no-op in the browser, where it's the default path).
          safeUnref(
            setTimeout(() => {
              buffer.flush(traceId);
            }, 500),
          );
        });
      }
    },
  };
}) satisfies IntegrationFn;
