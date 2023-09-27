import type { Client } from '@sentry/types';

import { getActiveSpan } from './getActiveSpan';

/** Ensure the `trace` context is set on all events. */
export function setupEventContextTrace(client: Client): void {
  if (!client.addEventProcessor) {
    return;
  }

  client.addEventProcessor(event => {
    const otelSpan = getActiveSpan();
    if (!otelSpan) {
      return event;
    }

    const otelSpanContext = otelSpan.spanContext();

    // If event has already set `trace` context, use that one.
    event.contexts = {
      trace: {
        trace_id: otelSpanContext.traceId,
        span_id: otelSpanContext.spanId,
        parent_span_id: otelSpan.parentSpanId,
      },
      ...event.contexts,
    };

    return event;
  });
}
