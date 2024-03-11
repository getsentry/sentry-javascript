import { getRootSpan } from '@sentry/core';
import type { Client } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { getActiveSpan } from './utils/getActiveSpan';
import { spanHasName, spanHasParentId } from './utils/spanTypes';

/** Ensure the `trace` context is set on all events. */
export function setupEventContextTrace(client: Client): void {
  client.addEventProcessor(event => {
    const span = getActiveSpan();
    // For transaction events, this is handled separately
    // Because the active span may not be the span that is actually the transaction event
    if (!span || event.type === 'transaction') {
      return event;
    }

    const spanContext = span.spanContext();

    // If event has already set `trace` context, use that one.
    event.contexts = {
      trace: dropUndefinedKeys({
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        parent_span_id: spanHasParentId(span) ? span.parentSpanId : undefined,
      }),
      ...event.contexts,
    };

    const rootSpan = getRootSpan(span);
    const transactionName = spanHasName(rootSpan) ? rootSpan.name : undefined;
    if (transactionName && !event.transaction) {
      event.transaction = transactionName;
    }

    return event;
  });
}
