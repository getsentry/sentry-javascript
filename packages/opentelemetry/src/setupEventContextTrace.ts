import { getRootSpan } from '@sentry/core';
import type { Client } from '@sentry/types';
import { getDynamicSamplingContextFromSpan } from './utils/dynamicSamplingContext';

import { getActiveSpan } from './utils/getActiveSpan';
import { spanHasName } from './utils/spanTypes';

/** Ensure the `trace` context is set on all events. */
export function setupEventContextTrace(client: Client): void {
  client.on('preprocessEvent', event => {
    const span = getActiveSpan();
    // For transaction events, this is handled separately
    // Because the active span may not be the span that is actually the transaction event
    if (!span || event.type === 'transaction') {
      return;
    }

    event.sdkProcessingMetadata = {
      dynamicSamplingContext: getDynamicSamplingContextFromSpan(span),
      ...event.sdkProcessingMetadata,
    };

    const rootSpan = getRootSpan(span);
    const transactionName = spanHasName(rootSpan) ? rootSpan.name : undefined;
    if (transactionName && !event.transaction) {
      event.transaction = transactionName;
    }
  });
}
