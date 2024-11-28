import { getDynamicSamplingContextFromSpan, getRootSpan } from '@sentry/core';
import { dropUndefinedKeys } from '@sentry/core';
import type { Client } from '@sentry/core';
import { SENTRY_TRACE_STATE_PARENT_SPAN_ID } from './constants';
import { getActiveSpan } from './utils/getActiveSpan';
import { spanHasParentId } from './utils/spanTypes';

/** Ensure the `trace` context is set on all events. */
export function setupEventContextTrace(client: Client): void {
  client.on('preprocessEvent', event => {
    const span = getActiveSpan();
    // For transaction events, this is handled separately
    // Because the active span may not be the span that is actually the transaction event
    if (!span || event.type === 'transaction') {
      return;
    }

    const spanContext = span.spanContext();

    // If we have a parent span id from trace state, use that ('' means no parent should be used)
    // Else, pick the one from the span
    const parentSpanIdFromTraceState = spanContext.traceState?.get(SENTRY_TRACE_STATE_PARENT_SPAN_ID);
    const parent_span_id =
      typeof parentSpanIdFromTraceState === 'string'
        ? parentSpanIdFromTraceState || undefined
        : spanHasParentId(span)
          ? span.parentSpanId
          : undefined;

    // If event has already set `trace` context, use that one.
    event.contexts = {
      trace: dropUndefinedKeys({
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        parent_span_id,
      }),
      ...event.contexts,
    };

    const rootSpan = getRootSpan(span);

    event.sdkProcessingMetadata = {
      dynamicSamplingContext: getDynamicSamplingContextFromSpan(rootSpan),
      ...event.sdkProcessingMetadata,
    };

    return event;
  });
}
