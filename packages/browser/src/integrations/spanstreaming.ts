import type { IntegrationFn } from '@sentry/core/browser';
import {
  captureSpan,
  debug,
  defineIntegration,
  hasSpanStreamingEnabled,
  isStaticBeforeSendSpanCallback,
  SpanBuffer,
  spanIsSampled,
} from '@sentry/core/browser';
import { DEBUG_BUILD } from '../debug-build';

export const spanStreamingIntegration = defineIntegration(() => {
  return {
    name: 'SpanStreaming' as const,

    setup(client) {
      const initialMessage = 'SpanStreaming integration requires';
      const fallbackMsg = 'Falling back to static trace lifecycle.';
      const clientOptions = client.getOptions();

      if (!hasSpanStreamingEnabled(client)) {
        clientOptions.traceLifecycle = 'static';
        DEBUG_BUILD && debug.warn(`${initialMessage} \`traceLifecycle\` to be set to "stream"! ${fallbackMsg}`);
        return;
      }

      const beforeSendSpan = clientOptions.beforeSendSpan;
      if (isStaticBeforeSendSpanCallback(beforeSendSpan)) {
        clientOptions.traceLifecycle = 'static';
        DEBUG_BUILD &&
          debug.warn(
            `SpanStreaming integration is incompatible with a beforeSendSpan callback using \`withStaticSpan\`! ${fallbackMsg}`,
          );
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
