import type { Client } from '../../client';
import type { SpanContainerItem } from '../../types/envelope';
import type { Event } from '../../types/event';
import { createSpanContainerItem } from './envelope';
import { hasSpanStreamingEnabled } from './hasSpanStreamingEnabled';
import { spanJsonToSerializedStreamedSpan } from './spanJsonToStreamedSpan';

/**
 * Extracts gen_ai spans from a transaction event, converts them to span v2 format,
 * and returns them as a SpanContainerItem.
 *
 * Only applies to static mode (non-streaming) transactions.
 *
 * WARNING: This function mutates `event.spans` by removing the extracted gen_ai spans
 * from the array. Call this before creating the event envelope so the transaction
 * item does not include the extracted spans.
 */
export function extractGenAiSpansFromEvent(event: Event, client: Client): SpanContainerItem | undefined {
  if (
    event.type !== 'transaction' ||
    !event.spans?.length ||
    !event.sdkProcessingMetadata?.hasGenAiSpans ||
    client.getOptions().streamGenAiSpans === false ||
    hasSpanStreamingEnabled(client)
  ) {
    return undefined;
  }

  const genAiSpans = [];
  const remainingSpans = [];

  for (const span of event.spans) {
    if (span.op?.startsWith('gen_ai.')) {
      genAiSpans.push(spanJsonToSerializedStreamedSpan(span));
    } else {
      remainingSpans.push(span);
    }
  }

  if (genAiSpans.length === 0) {
    return undefined;
  }

  event.spans = remainingSpans;

  return createSpanContainerItem(genAiSpans, client);
}
