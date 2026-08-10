import type { Client } from '@sentry/core';
import { getDynamicSamplingContextFromSpan, getRootSpan, spanToTraceContext } from '@sentry/core';
import { getActiveSpan } from './utils/getActiveSpan';

/** Ensure the `trace` context is set on all events. */
export function setupEventContextTrace(client: Client): void {
  client.on('preprocessEvent', event => {
    const span = getActiveSpan();
    if (!span) {
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
