import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { expect } from 'vitest';

type StreamedSpan = SerializedStreamedSpanContainer['items'][number];

export function expectGraphqlTrace(
  segmentName: string,
  assertTrace: (segment: StreamedSpan, children: StreamedSpan[], allSpans: StreamedSpan[]) => void,
): (container: SerializedStreamedSpanContainer) => void {
  const spans: StreamedSpan[] = [];

  // Unordered expectations retry as envelopes arrive; children can flush before their segment.
  return container => {
    spans.push(...container.items);
    const segment = spans.find(span => span.is_segment && span.name === segmentName);
    expect(segment).toBeDefined();
    const children = spans.filter(
      span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment!.span_id,
    );
    assertTrace(segment!, children, spans);
  };
}
