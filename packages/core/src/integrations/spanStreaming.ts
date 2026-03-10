import type { IntegrationFn } from '../types-hoist/integration';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { isStreamedBeforeSendSpanCallback } from '../tracing/spans/beforeSendSpan';
import { captureSpan } from '../tracing/spans/captureSpan';
import { hasSpanStreamingEnabled } from '../tracing/spans/hasSpanStreamingEnabled';
import { SpanBuffer } from '../tracing/spans/spanBuffer';
import { debug } from '../utils/debug-logger';
import { spanIsSampled } from '../utils/spanUtils';

export const spanStreamingIntegration = defineIntegration(() => {
  return {
    name: 'SpanStreaming',

    setup(client) {
      const initialMessage = 'SpanStreaming integration requires';
      const fallbackMsg = 'Falling back to static trace lifecycle.';

      if (!hasSpanStreamingEnabled(client)) {
        DEBUG_BUILD && debug.warn(`${initialMessage} \`traceLifecycle\` to be set to "stream"! ${fallbackMsg}`);
        return;
      }

      const beforeSendSpan = client.getOptions().beforeSendSpan;
      if (beforeSendSpan && !isStreamedBeforeSendSpanCallback(beforeSendSpan)) {
        client.getOptions().traceLifecycle = 'static';
        DEBUG_BUILD &&
          debug.warn(`${initialMessage} a beforeSendSpan callback using \`withStreamedSpan\`! ${fallbackMsg}`);
        return;
      }

      const buffer = new SpanBuffer(client);

      client.on('afterSpanEnd', span => {
        if (!spanIsSampled(span)) {
          return;
        }
        buffer.add(captureSpan(span, client));
      });
    },
  };
}) satisfies IntegrationFn;
