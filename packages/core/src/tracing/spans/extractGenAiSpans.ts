import type { Client } from '../../client';
import type { SpanContainerItem } from '../../types-hoist/envelope';
import type { Event } from '../../types-hoist/event';
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
    hasSpanStreamingEnabled(client)
  ) {
    return undefined;
  }

  const genAiSpans = [];
  const remainingSpans = [];

  for (const span of event.spans) {
    if (span.op?.startsWith('gen_ai.')) {
      genAiSpans.push(span);
    } else {
      remainingSpans.push(span);
    }
  }

  if (genAiSpans.length === 0) {
    return undefined;
  }

  const serializedSpans = genAiSpans.map(span => spanJsonToSerializedStreamedSpan(span));

  // Remove gen_ai spans from the legacy transaction
  event.spans = remainingSpans;

  return [
    { type: 'span', item_count: serializedSpans.length, content_type: 'application/vnd.sentry.items.span.v2+json' },
    { items: serializedSpans },
  ];
}
