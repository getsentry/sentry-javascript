import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { CACHE_ORIGIN_LINK_ATTRIBUTES, findCacheSpan } from './cacheOriginLinks-utils';

// Origin links for `use cache` in route handlers. Target behavior: a cache hit records a
// `cache.get` span carrying a `sentry.link.type: 'cache_origin'` span link to the `cache.put`
// span of the trace that filled the entry; unknown origin means no link. Not implemented yet —
// every test is `test.fail()`; shipping the feature should only require deleting those lines.

test('links a route handler cache hit to the trace that filled the entry', async ({ request }) => {
  test.fail();

  // A fresh id makes the first request a guaranteed cache miss (the id is part of the cache key)
  // even when the test is retried against the same server.
  const id = crypto.randomUUID();

  const missSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put')
    );
  });

  await request.get(`/api/use-cache?id=${id}`);
  const missSpans = await missSpansPromise;

  const hitSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
    );
  });

  await request.get(`/api/use-cache?id=${id}`);
  const hitSpans = await hitSpansPromise;

  const putSpan = findCacheSpan(missSpans, 'cache.put');
  expect(putSpan).toBeDefined();

  // A miss has no origin, and the SDK never guesses one.
  const missGetSpan = findCacheSpan(missSpans, 'cache.get', false);
  expect(missGetSpan?.links).toBeUndefined();
  expect(putSpan?.links).toBeUndefined();

  const hitGetSpan = findCacheSpan(hitSpans, 'cache.get', true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: putSpan!.trace_id,
      span_id: putSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);
});

test('moves the origin link to the refill trace after the entry expires', async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Entries are only discarded at `expire` in production');
  test.fail();

  const id = crypto.randomUUID();

  const fillSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache-expiring' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put')
    );
  });

  await request.get(`/api/use-cache-expiring?id=${id}`);
  const fillSpans = await fillSpansPromise;

  // Sleep past the entry's hard `expire` limit (2s), so the next read must discard and refill it.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  // Registered after the fill trace was consumed, so it only matches the refill.
  const refillSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache-expiring' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put') &&
      spansOfTrace.every(span => span.trace_id !== fillSpans[0]!.trace_id)
    );
  });

  await request.get(`/api/use-cache-expiring?id=${id}`);
  const refillSpans = await refillSpansPromise;

  const hitSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache-expiring' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
    );
  });

  await request.get(`/api/use-cache-expiring?id=${id}`);
  const hitSpans = await hitSpansPromise;

  const refillPutSpan = findCacheSpan(refillSpans, 'cache.put');
  expect(refillPutSpan).toBeDefined();
  expect(refillPutSpan!.trace_id).not.toBe(fillSpans[0]!.trace_id);

  // The hit read the refilled entry, so the link points at the refill trace, not the first fill.
  const hitGetSpan = findCacheSpan(hitSpans, 'cache.get', true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: refillPutSpan!.trace_id,
      span_id: refillPutSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);
});
