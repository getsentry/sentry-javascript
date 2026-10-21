import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp } from '@sentry-internal/test-utils';

export const CACHE_ORIGIN_LINK_ATTRIBUTES = {
  'sentry.link.type': { value: 'cache_origin', type: 'string' },
};

export function findCacheSpan(
  spans: SerializedStreamedSpan[],
  op: 'cache.get' | 'cache.put',
  hit?: boolean,
): SerializedStreamedSpan | undefined {
  return spans.find(
    span => getSpanOp(span) === op && (hit === undefined || span.attributes['cache.hit']?.value === hit),
  );
}
