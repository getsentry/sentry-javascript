import type { Envelope, SerializedStreamedSpan, SerializedStreamedSpanContainer } from '@sentry/core';

export { getSpanOp } from '@sentry-internal/test-utils';

/**
 * The span v2 container of an envelope, or `undefined` when the envelope carries no span item.
 */
export function getSpanContainer(envelope: Envelope): SerializedStreamedSpanContainer | undefined {
  const spanItem = envelope[1].find(item => item[0].type === 'span');
  return spanItem?.[1] as SerializedStreamedSpanContainer | undefined;
}

/**
 * The spans of an envelope, or an empty array when the envelope carries no span item.
 */
export function getSpansFromEnvelope(envelope: Envelope): SerializedStreamedSpan[] {
  return getSpanContainer(envelope)?.items ?? [];
}
