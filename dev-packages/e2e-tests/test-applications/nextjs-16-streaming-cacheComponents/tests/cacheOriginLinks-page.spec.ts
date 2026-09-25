import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { CACHE_ORIGIN_LINK_ATTRIBUTES } from './cacheOriginLinks-utils';

// Origin links for `use cache` inside rendered pages (cached components and nested cached
// functions). Target behavior: a cache hit records a `cache.get` span carrying a
// `sentry.link.type: 'cache_origin'` span link to the `cache.put` span of the trace that filled
// the entry. Not implemented yet — every test is `test.fail()`.

// Two cached sibling components are two cache entries (props are part of the key), so one request
// carries one `cache.get` hit span per section, each linking to its own fill. The components sit
// in a dynamic hole: entries served from the prerendered shell (Resume Data Cache) never reach
// the cache handlers and produce no spans until Next.js exposes RDC reads.
test('links each sibling component hit to the fill of its own entry', async ({ request }) => {
  test.fail();

  const id = crypto.randomUUID();

  const missSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /cached-sibling-components' && span.is_segment) &&
      spansOfTrace.filter(span => getSpanOp(span) === 'cache.put').length >= 2
    );
  });

  await request.get(`/cached-sibling-components?id=${id}`);
  const missSpans = await missSpansPromise;

  const hitSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /cached-sibling-components' && span.is_segment) &&
      spansOfTrace.filter(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
        .length >= 2
    );
  });

  await request.get(`/cached-sibling-components?id=${id}`);
  const hitSpans = await hitSpansPromise;

  // The key digest (`cache.key`) pairs a hit with the put that filled the same entry.
  const putSpansByKey = new Map(
    missSpans
      .filter(span => getSpanOp(span) === 'cache.put')
      .map(span => [JSON.stringify(span.attributes['cache.key']?.value), span] as const),
  );
  expect(putSpansByKey.size).toBe(2);

  const hitGetSpans = hitSpans.filter(
    span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true,
  );
  // Deduplicated by entry because dev mode can render (and therefore read) more than once.
  expect(new Set(hitGetSpans.map(span => JSON.stringify(span.attributes['cache.key']?.value))).size).toBe(2);

  for (const hitSpan of hitGetSpans) {
    const putSpan = putSpansByKey.get(JSON.stringify(hitSpan.attributes['cache.key']?.value));
    expect(putSpan).toBeDefined();
    expect(hitSpan.links).toEqual([
      {
        trace_id: putSpan!.trace_id,
        span_id: putSpan!.span_id,
        sampled: true,
        attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
      },
    ]);
  }

  // The two sections link to two different fill spans, not to one shared origin.
  expect(new Set(hitGetSpans.map(span => span.links?.[0]?.span_id)).size).toBe(2);
});

test("links a nested cache hit inside another entry's refill to the original fill trace", async ({ request }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Entries are only discarded at `expire` in production');
  test.fail();

  const id = crypto.randomUUID();

  const missSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /nested-caches' && span.is_segment) &&
      spansOfTrace.filter(span => getSpanOp(span) === 'cache.put').length >= 2
    );
  });

  await request.get(`/nested-caches?id=${id}`);
  const missSpans = await missSpansPromise;

  // Sleep past the component entry's hard `expire` limit (2s); the nested function entry
  // (`cacheLife('hours')`) stays valid.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  const refillSpansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /nested-caches' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true)
    );
  });

  await request.get(`/nested-caches?id=${id}`);
  const refillSpans = await refillSpansPromise;

  // The only hit is the nested function entry, read while the expired component entry refills.
  const hitGetSpans = refillSpans.filter(
    span => getSpanOp(span) === 'cache.get' && span.attributes['cache.hit']?.value === true,
  );
  expect(hitGetSpans).toHaveLength(1);

  const nestedPutSpan = missSpans.find(
    span =>
      getSpanOp(span) === 'cache.put' &&
      JSON.stringify(span.attributes['cache.key']?.value) ===
        JSON.stringify(hitGetSpans[0]!.attributes['cache.key']?.value),
  );
  expect(nestedPutSpan).toBeDefined();

  // Even though the read happens inside the component's isolated fill context, the link still
  // points at the trace that originally filled the nested entry.
  expect(hitGetSpans[0]!.links).toEqual([
    {
      trace_id: nestedPutSpan!.trace_id,
      span_id: nestedPutSpan!.span_id,
      sampled: true,
      attributes: CACHE_ORIGIN_LINK_ATTRIBUTES,
    },
  ]);
});
