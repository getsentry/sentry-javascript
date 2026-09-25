import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { CACHE_ORIGIN_LINK_ATTRIBUTES, findCacheSpan } from './cacheOriginLinks-utils';

// Background stale-while-revalidate refills. Target behavior: the revalidation runs in its own
// trace (not grafted onto the serving trace), links back to the request that triggered it, and
// becomes the `cache_origin` for future hits. Not implemented yet — the test is `test.fail()`.

test('runs background revalidation in its own trace linked to the triggering request', async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'SWR revalidation timing only holds in production');
  test.fail();

  const id = crypto.randomUUID();

  const fillSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache-swr' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put')
    );
  });

  await request.get(`/api/use-cache-swr?id=${id}`);
  const fillSpans = await fillSpansPromise;

  // Sleep past `revalidate` (2s) but not `expire`, so the next read serves the stale value and
  // triggers a background refill.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  const staleHitSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache-swr' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
    );
  });

  // Refill work the visitor never waited for is not grafted onto the serving trace: the
  // background revalidation is its own trace with a `cache.revalidate` segment.
  const revalidationSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => getSpanOp(span) === 'cache.revalidate' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put')
    );
  });

  await request.get(`/api/use-cache-swr?id=${id}`);
  const staleHitSpans = await staleHitSpansPromise;

  const fillPutSpan = findCacheSpan(fillSpans, 'cache.put');
  expect(fillPutSpan).toBeDefined();

  // The stale response still came from the original fill.
  const staleHitGetSpan = findCacheSpan(staleHitSpans, 'cache.get', true);
  expect(staleHitGetSpan).toBeDefined();
  expect(staleHitGetSpan?.links).toEqual([
    {
      trace_id: fillPutSpan!.trace_id,
      span_id: fillPutSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);

  const revalidationSpans = await revalidationSpansPromise;
  const revalidationSegment = revalidationSpans.find(span => span.is_segment && getSpanOp(span) === 'cache.revalidate');
  expect(revalidationSegment).toBeDefined();
  expect(revalidationSegment!.trace_id).not.toBe(staleHitGetSpan!.trace_id);
  expect(revalidationSegment!.links).toEqual([
    {
      trace_id: staleHitGetSpan!.trace_id,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      sampled: true,
      // The link type for "revalidation triggered by" is not final yet; the target trace is.
      attributes: { 'sentry.link.type': { value: expect.any(String), type: 'string' } },
    },
  ]);

  const revalidationPutSpan = findCacheSpan(revalidationSpans, 'cache.put');
  expect(revalidationPutSpan).toBeDefined();

  // The revalidation becomes the origin for future hits.
  const hitAfterRefillSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache-swr' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true) &&
      spansOfTrace.every(span => span.trace_id !== staleHitGetSpan!.trace_id)
    );
  });

  await request.get(`/api/use-cache-swr?id=${id}`);
  const hitAfterRefillSpans = await hitAfterRefillSpansPromise;

  const hitAfterRefillGetSpan = findCacheSpan(hitAfterRefillSpans, 'cache.get', true);
  expect(hitAfterRefillGetSpan).toBeDefined();
  expect(hitAfterRefillGetSpan?.links).toEqual([
    {
      trace_id: revalidationPutSpan!.trace_id,
      span_id: revalidationPutSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);
});
