import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { findCacheSpan } from './cacheOriginLinks-utils';

// Webpack lists route handler `use cache` functions in the server-reference manifest, Turbopack
// (Next.js 16.3) does not. `TEST_BUNDLER` marks the webpack variant's production run (set in
// `test:assert-webpack`).
const isWebpackBuild = process.env.TEST_BUNDLER === 'webpack' || process.env.TEST_ENV === 'development-webpack';
const expectedRouteHandlerFilePath = isWebpackBuild ? 'app/api/use-cache/route.ts' : undefined;

test('uses low-cardinality names for `use cache` spans', async ({ request }) => {
  // A fresh id makes the request a guaranteed cache miss (the id is part of the cache key), so the
  // trace contains both a `cache.get` and a `cache.put` span.
  const id = crypto.randomUUID();

  const spansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /api/use-cache' && span.is_segment) &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.get') &&
      spansOfTrace.some(span => getSpanOp(span) === 'cache.put')
    );
  });

  await request.get(`/api/use-cache?id=${id}`);
  const spans = await spansPromise;

  // With span streaming the span name is the low-cardinality op; the key digest stays on
  // `cache.key`, where Relay reads the span description from.
  const getSpan = findCacheSpan(spans, 'cache.get');
  expect(getSpan).toBeDefined();
  expect(getSpan!.name).toBe('cache.get');
  const cacheKeyDigest = getSpan!.attributes['cache.key']?.value;
  expect(cacheKeyDigest).toEqual([expect.stringMatching(/^[0-9a-f]{12}$/)]);

  const putSpan = findCacheSpan(spans, 'cache.put');
  expect(putSpan).toBeDefined();
  expect(putSpan!.name).toBe('cache.put');
  expect(putSpan!.attributes['cache.key']?.value).toEqual(cacheKeyDigest);

  expect(putSpan!.attributes['code.file.path']?.value).toBe(expectedRouteHandlerFilePath);
});

test('sets the source file of the cached component on `cache.put` spans', async ({ request }) => {
  const id = crypto.randomUUID();

  const spansPromise = collectStreamedSpans('nextjs-16-streaming-cacheComponents', spansOfTrace => {
    return (
      spansOfTrace.some(span => span.name === 'GET /cached-sibling-components' && span.is_segment) &&
      spansOfTrace.filter(span => getSpanOp(span) === 'cache.put').length >= 2
    );
  });

  await request.get(`/cached-sibling-components?id=${id}`);
  const spans = await spansPromise;

  // Both sibling entries come from the same page file.
  const putSpans = spans.filter(span => getSpanOp(span) === 'cache.put');
  expect(putSpans.length).toBeGreaterThanOrEqual(2);
  for (const putSpan of putSpans) {
    expect(putSpan.attributes['code.file.path']?.value).toBe('app/cached-sibling-components/page.tsx');
  }

  // The source file marks the producer of an entry. Reads do not carry it.
  const getSpan = findCacheSpan(spans, 'cache.get');
  expect(getSpan).toBeDefined();
  expect(getSpan!.attributes['code.file.path']).toBeUndefined();
});
