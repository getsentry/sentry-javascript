import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import { SENTRY_ORIGIN, URL_PATH } from '@sentry/conventions/attributes';

test('creates cache spans for a cached function', async ({ request }) => {
  const userId = `user-${Date.now()}`;
  const spansPromise = collectStreamedSpansUntilSegment(
    'node-nitro-3',
    span => span.attributes[URL_PATH]?.value === '/api/test-cache',
  );

  await request.get(`/api/test-cache?user=${userId}`);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;
  const cacheSpans = spans.filter(
    span =>
      span.attributes[SENTRY_ORIGIN]?.value === 'auto.cache.nitro' &&
      String(span.attributes['cache.key']?.value).includes(`user:${userId}`),
  );

  expect(segmentSpan.name).toBe('GET /api/test-cache');
  expect(cacheSpans.map(span => [getSpanOp(span), span.attributes['cache.hit']?.value])).toEqual([
    ['cache.get', false],
    ['cache.put', undefined],
    ['cache.get', true],
  ]);
  cacheSpans.forEach(span => expect(span.trace_id).toBe(segmentSpan.trace_id));
});
