import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

// Origin links (`sentry.link.type: 'cache_origin'`, see cacheOriginLinks.spec.ts) for `use cache`
// in nested layout trees under `app/(cached-nesting)/`. Not implemented yet — every test is
// `test.fail()` with the final expected assertions.

const CACHE_ORIGIN_LINK_ATTRIBUTES = {
  'sentry.link.type': { value: 'cache_origin', type: 'string' },
};

function findCacheSpan(
  spans: SerializedStreamedSpan[],
  op: 'cache.get' | 'cache.put',
  hit?: boolean,
): SerializedStreamedSpan | undefined {
  return spans.find(
    span => getSpanOp(span) === op && (hit === undefined || span.attributes['cache.hit']?.value === hit),
  );
}

// A `use cache` layout between dynamic segments. The layout entry is keyed by the awaited [id]
// param. If Next serves the entry from the prerendered shell (Resume Data Cache) instead of the
// cache handlers, there is no `cache.get` span at all — then this stays failing until Next
// exposes RDC reads.
test('links a cached layout hit to the trace that filled it', async ({ request }) => {
  test.fail();

  const id = crypto.randomUUID();

  const missSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /cached-mid-layout/[id]' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put')
    );
  });

  await request.get(`/cached-mid-layout/${id}`);
  const missSpans = await missSpansPromise;

  const hitSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /cached-mid-layout/[id]' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
    );
  });

  await request.get(`/cached-mid-layout/${id}`);
  const hitSpans = await hitSpansPromise;

  // The layout is the only cached entry on this route.
  const putSpan = findCacheSpan(missSpans, 'cache.put');
  expect(putSpan).toBeDefined();

  const hitGetSpan = findCacheSpan(hitSpans, 'cache.get', true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan!.attributes['cache.key']).toEqual(putSpan!.attributes['cache.key']);
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: putSpan!.trace_id,
      span_id: putSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);
});

// Inverse nesting: all layouts above are dynamic, only the leaf component is cached — the leaf
// entry is the only span that carries a link.
test('links a cached leaf under dynamic layouts to the trace that filled it', async ({ request }) => {
  test.fail();

  const id = crypto.randomUUID();

  const missSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /dynamic-layouts/[id]/layout-cached-leaf' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put')
    );
  });

  await request.get(`/dynamic-layouts/${id}/layout-cached-leaf`);
  const missSpans = await missSpansPromise;

  const hitSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /dynamic-layouts/[id]/layout-cached-leaf' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
    );
  });

  await request.get(`/dynamic-layouts/${id}/layout-cached-leaf`);
  const hitSpans = await hitSpansPromise;

  const putSpan = findCacheSpan(missSpans, 'cache.put');
  expect(putSpan).toBeDefined();

  const hitGetSpan = findCacheSpan(hitSpans, 'cache.get', true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan!.attributes['cache.key']).toEqual(putSpan!.attributes['cache.key']);
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: putSpan!.trace_id,
      span_id: putSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);
});

// Nested levels with different lifetimes: after the layout expired, request 2 refills the layout
// while the component still hits. Request 3 then hits both entries, and its two `cache.get`
// spans point at two different origin traces.
test('links two cached levels to different origin traces after the layout expires', async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Entries are only discarded at `expire` in production');
  test.fail();

  const id = crypto.randomUUID();

  const fillSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /mixed-lifetimes/[id]' && span.is_segment) &&
      spansOfTrace.filter(span => getSpanOp(span) === 'cache.put').length >= 2
    );
  });

  await request.get(`/mixed-lifetimes/${id}`);
  const fillSpans = await fillSpansPromise;

  // Layout + component entry.
  const fillPutSpans = fillSpans.filter(span => getSpanOp(span) === 'cache.put');
  expect(new Set(fillPutSpans.map(span => JSON.stringify(span.attributes['cache.key']?.value))).size).toBe(2);

  // Sleep past the layout's `expire` (2s); the component entry stays valid for hours.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  const refillSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /mixed-lifetimes/[id]' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put') &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
    );
  });

  await request.get(`/mixed-lifetimes/${id}`);
  const refillSpans = await refillSpansPromise;

  const hitSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /mixed-lifetimes/[id]' && span.is_segment) &&
      spansOfTrace.filter(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
        .length >= 2
    );
  });

  await request.get(`/mixed-lifetimes/${id}`);
  const hitSpans = await hitSpansPromise;

  const layoutPutSpan = findCacheSpan(refillSpans, 'cache.put');
  expect(layoutPutSpan).toBeDefined();
  const layoutKey = JSON.stringify(layoutPutSpan!.attributes['cache.key']?.value);
  const componentPutSpan = fillPutSpans.find(span => JSON.stringify(span.attributes['cache.key']?.value) !== layoutKey);
  expect(componentPutSpan).toBeDefined();
  expect(layoutPutSpan!.trace_id).not.toBe(componentPutSpan!.trace_id);

  const layoutHitSpan = hitSpans.find(
    span => getSpanOp(span) === 'cache.get' && JSON.stringify(span.attributes['cache.key']?.value) === layoutKey,
  );
  expect(layoutHitSpan?.links).toEqual([
    {
      trace_id: layoutPutSpan!.trace_id,
      span_id: layoutPutSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);

  const componentHitSpan = hitSpans.find(
    span =>
      getSpanOp(span) === 'cache.get' &&
      JSON.stringify(span.attributes['cache.key']?.value) ===
        JSON.stringify(componentPutSpan!.attributes['cache.key']?.value),
  );
  expect(componentHitSpan?.links).toEqual([
    {
      trace_id: componentPutSpan!.trace_id,
      span_id: componentPutSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);
});

// Routes `a` and `b` share one layout entry: a hit on `b` links to the fill trace of `a`, so the
// origin is a different transaction than the serving one.
test('links a shared layout hit on a sibling route to the route that filled it', async ({ request }) => {
  test.fail();

  const id = crypto.randomUUID();

  const fillSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /shared-layout/[id]/a' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put')
    );
  });

  await request.get(`/shared-layout/${id}/a`);
  const fillSpans = await fillSpansPromise;

  const hitSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /shared-layout/[id]/b' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
    );
  });

  await request.get(`/shared-layout/${id}/b`);
  const hitSpans = await hitSpansPromise;

  const putSpan = findCacheSpan(fillSpans, 'cache.put');
  expect(putSpan).toBeDefined();

  const hitGetSpan = findCacheSpan(hitSpans, 'cache.get', true);
  expect(hitGetSpan).toBeDefined();
  expect(hitGetSpan!.attributes['cache.key']).toEqual(putSpan!.attributes['cache.key']);
  expect(hitGetSpan?.links).toEqual([
    {
      trace_id: putSpan!.trace_id,
      span_id: putSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);
});
