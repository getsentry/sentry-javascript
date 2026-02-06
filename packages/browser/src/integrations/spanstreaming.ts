import type { IntegrationFn } from '@sentry/core';
import {
  captureSpan,
  debug,
  defineIntegration,
  hasSpanStreamingEnabled,
  isStreamedBeforeSendSpanCallback,
  SpanBuffer,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

export const spanStreamingIntegration = defineIntegration(() => {
  return {
    name: 'SpanStreaming',

    beforeSetup(client) {
      // If users only set spanstreamingIntegration, without traceLifecycle, we set it to "stream" for them.
      // This avoids the classic double-opt-in problem we'd otherwise have in the browser SDK.
      const clientOptions = client.getOptions();
      if (!clientOptions.traceLifecycle) {
        DEBUG_BUILD && debug.warn('[SpanStreaming] set `traceLifecycle` to "stream"');
        clientOptions.traceLifecycle = 'stream';
      }
    },

    setup(client) {
      const initialMessage = 'spanStreamingIntegration requires';
      const fallbackMsg = 'Falling back to static trace lifecycle.';

      if (!hasSpanStreamingEnabled(client)) {
        DEBUG_BUILD && debug.warn(`${initialMessage} \`traceLifecycle\` to be set to "stream"! ${fallbackMsg}`);
        return;
      }

      const beforeSendSpan = client.getOptions().beforeSendSpan;
      // If users misconfigure their SDK by opting into span streaming but
      // using an incompatible beforeSendSpan callback, we fall back to the static trace lifecycle.
      if (beforeSendSpan && !isStreamedBeforeSendSpanCallback(beforeSendSpan)) {
        client.getOptions().traceLifecycle = 'static';
        debug.warn(`${initialMessage} a beforeSendSpan callback using \`withStreamSpan\`! ${fallbackMsg}`);
        return;
      }

      const buffer = new SpanBuffer(client);

      client.on('afterSpanEnd', span => buffer.add(captureSpan(span, client)));

      // In addition to capturing the span, we also flush the trace when the segment
      // span ends to ensure things are sent timely. We never know when the browser
      // is closed, users navigate away, etc.
      client.on('afterSegmentSpanEnd', segmentSpan => buffer.flush(segmentSpan.spanContext().traceId));
    },
  };
}) satisfies IntegrationFn;
