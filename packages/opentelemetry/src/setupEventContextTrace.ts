import type { Client } from '@sentry/core';
import { getDynamicSamplingContextFromSpan, getRootSpan, spanToTraceContext } from '@sentry/core';
import { getActiveSpan } from './utils/getActiveSpan';

/** Ensure the `trace` context is set on all events. */
export function setupEventContextTrace(client: Client): void {
  client.on('preprocessEvent', event => {
    const span = getActiveSpan();
    // For transaction events, this is handled separately
    // Because the active span may not be the span that is actually the transaction event
    if (!span || event.type === 'transaction') {
      return;
    }

    // If event has already set `trace` context, use that one.
    event.contexts = {
      trace: spanToTraceContext(span),
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
