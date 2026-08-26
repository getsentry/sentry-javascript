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
        // Negatively sampled spans must not be captured.
        // This happens because OTel and we create non-recording spans for negatively sampled spans
        // that go through the same life cycle as recording spans.
        if (!spanIsSampled(span)) {
          return;
        }
        buffer.add(captureSpan(span, client));
      });

      // In addition to capturing the span, we also flush the trace when the segment
      // span ends to ensure things are sent timely. We never know when the browser
      // is closed, users navigate away, etc.
      client.on('afterSegmentSpanEnd', segmentSpan => {
        const traceId = segmentSpan.spanContext().traceId;
        setTimeout(() => {
          buffer.flush(traceId);
        }, 500);
      });
    },
  };
}) satisfies IntegrationFn;
