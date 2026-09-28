import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { CACHE_ORIGIN_LINK_ATTRIBUTES, findCacheSpan } from './cacheOriginLinks-utils';

// Background stale-while-revalidate refills. Target behavior: the revalidation gets its own trace,
// separate from the request trace that served the stale value. The revalidation trace links back to
// that request, and its `cache.put` becomes the `cache_origin` for future hits.

/*

Trace1 (fill)              Trace2 (stale hit)               Trace3 (hit)
|- put key:A <----link-----o get hit=true key:A             |- get hit=true key:A
                           ^                                |
                           | link (type TBD in the RFC)     |
TraceR: cache.revalidate --o  (own trace)                   |
|                                                           |
|- put key:A  <----------------------link-------------------o cache_origin

*/

// Not implemented yet. Unlike cacheOriginLinks-nesting.spec.ts, this test cannot document the
// target behavior with `test.fail()`: it would wait for a `cache.revalidate` trace that never
// arrives and time out, and Playwright reports a timeout as a real failure even under
// `test.fail()`. So the test is `test.fixme()` until the SDK emits the revalidation trace.

test('runs background revalidation in its own trace linked to the triggering request', async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'SWR revalidation timing only holds in production');
  test.fixme();

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

  // The visitor never waited for the refill, so the refill is not part of the serving trace: the
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
      // No link type for cache spans specced yet, so assert only the link target.
      attributes: { 'sentry.link.type': { value: expect.any(String), type: 'string' } },
    },
  ]);

  const revalidationPutSpan = findCacheSpan(revalidationSpans, 'cache.put');
  expect(revalidationPutSpan).toBeDefined();

  // The revalidation's `cache.put` becomes the `cache_origin` for future hits.
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
