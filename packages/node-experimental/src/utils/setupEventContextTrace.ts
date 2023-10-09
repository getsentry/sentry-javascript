import type { Client } from '@sentry/types';

import { getActiveSpan } from './getActiveSpan';
import { spanHasParentId } from './spanTypes';

/** Ensure the `trace` context is set on all events. */
export function setupEventContextTrace(client: Client): void {
  if (!client.addEventProcessor) {
    return;
  }

  client.addEventProcessor(event => {
    const span = getActiveSpan();
    if (!span) {
      return event;
    }

    const spanContext = span.spanContext();

    // If event has already set `trace` context, use that one.
    event.contexts = {
      trace: {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        parent_span_id: spanHasParentId(span) ? span.parentSpanId : undefined,
      },
      ...event.contexts,
    };

    return event;
  });
}
