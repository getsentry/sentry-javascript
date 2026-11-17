import type { SerializedStreamedSpan, SerializedStreamedSpanContainer } from '@sentry/core';

export function findSegmentSpan(container: SerializedStreamedSpanContainer): SerializedStreamedSpan | undefined {
  return container.items.find(item => item.is_segment);
}

export function findExpressSpan(
  container: SerializedStreamedSpanContainer,
  type: string,
): SerializedStreamedSpan | undefined {
  return container.items.find(item => item.attributes['express.type']?.value === type);
}
