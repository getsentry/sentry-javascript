import type { IntegrationFn } from '../types/integration';
import { defineIntegration } from '../integration';
import { captureSpan } from '../tracing/spans/captureSpan';
import { SpanBuffer } from '../tracing/spans/spanBuffer';
import { spanIsSampled } from '../utils/spanUtils';

export const INTEGRATION_NAME = 'SpanStreaming' as const;

export const spanStreamingIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,

    setup(client) {
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
