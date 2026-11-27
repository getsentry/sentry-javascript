import { CACHE_HIT, URL_PATH } from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT } from '@sentry/conventions/op';
import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import { isViteServer, NITRO_ONLY } from './isViteServer';

test.skip(isViteServer, NITRO_ONLY);

test.describe('Cache Instrumentation', () => {
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  async function collectCacheSpans() {
    const spans = await collectStreamedSpansUntilSegment(
      'nuxt-4',
      span => span.attributes['url.path']?.value === '/api/cache-test',
      span => span.attributes['sentry.origin']?.value === 'auto.cache.nuxt',
    );

    return spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.cache.nuxt');
  }

  /** Every span of the request's trace, whatever created it, so that a second span for one cache access shows up. */
  function collectRequestSpans() {
    return collectStreamedSpansUntilSegment(
      'nuxt-4',
      span => span.attributes[URL_PATH]?.value === '/api/cache-test',
      span => getSpanOp(span) === CACHE_GET,
    );
  }

  test('instruments cachedFunction and cachedEventHandler calls and creates spans with correct attributes', async ({
    request,
  }) => {
    const cacheSpansPromise = collectCacheSpans();

    const response = await request.get('/api/cache-test');
    expect(response.status()).toBe(200);

    const allCacheSpans = await cacheSpansPromise;
    expect(allCacheSpans.length).toBeGreaterThan(0);

    // Helper to find spans by operation
    const findSpansByMethod = (method: string) =>
      allCacheSpans.filter(span => span.attributes['db.operation.name']?.value === method);

    const getCacheKey = (span: (typeof allCacheSpans)[number]) => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_KEY]?.value;

    // Test getItem spans for cachedFunction - should have both cache miss and cache hit
    const getItemSpans = findSpansByMethod('getItem');
    expect(getItemSpans.length).toBeGreaterThan(0);

    // Find cache miss (first call to getCachedUser('123'))
    const cacheMissSpan = getItemSpans.find(
      span =>
        typeof getCacheKey(span) === 'string' &&
        (getCacheKey(span) as string).includes('user:123') &&
        !span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value,
    );
    if (cacheMissSpan) {
      expect(cacheMissSpan.attributes).toMatchObject({
        'sentry.op': { type: 'string', value: 'cache.get' },
        'cache.operation': { type: 'string', value: 'get' },
        'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
        [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: false },
        'db.operation.name': { type: 'string', value: 'getItem' },
        'db.collection.name': { type: 'string', value: expect.stringMatching(/^(cache)?$/) },
      });
    }

    // Find cache hit (second call to getCachedUser('123'))
    const cacheHitSpan = getItemSpans.find(
      span =>
        typeof getCacheKey(span) === 'string' &&
        (getCacheKey(span) as string).includes('user:123') &&
        span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value,
    );
    if (cacheHitSpan) {
      expect(cacheHitSpan.attributes).toMatchObject({
        'sentry.op': { type: 'string', value: 'cache.get' },
        'cache.operation': { type: 'string', value: 'get' },
        'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
        [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
        'db.operation.name': { type: 'string', value: 'getItem' },
        'db.collection.name': { type: 'string', value: expect.stringMatching(/^(cache)?$/) },
      });
    }

    // Test setItem spans for cachedFunction - when cache miss occurs, value is set
    const setItemSpans = findSpansByMethod('setItem');
    expect(setItemSpans.length).toBeGreaterThan(0);

    const cacheSetSpan = setItemSpans.find(
      span => typeof getCacheKey(span) === 'string' && (getCacheKey(span) as string).includes('user:123'),
    );
    if (cacheSetSpan) {
      expect(cacheSetSpan.attributes).toMatchObject({
        'sentry.op': { type: 'string', value: 'cache.put' },
        'cache.operation': { type: 'string', value: 'put' },
        'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
        'db.operation.name': { type: 'string', value: 'setItem' },
        'db.collection.name': { type: 'string', value: expect.stringMatching(/^(cache)?$/) },
      });
    }

    // Test that we have spans for different cached functions
    const dataKeySpans = getItemSpans.filter(
      span => typeof getCacheKey(span) === 'string' && (getCacheKey(span) as string).includes('data:test-key'),
    );
    expect(dataKeySpans.length).toBeGreaterThan(0);

    // Test that we have spans for cachedEventHandler
    const cachedHandlerSpans = getItemSpans.filter(
      span => typeof getCacheKey(span) === 'string' && (getCacheKey(span) as string).includes('cachedHandler'),
    );
    expect(cachedHandlerSpans.length).toBeGreaterThan(0);

    // Verify all cache spans have OK status and are nested under the request's root span
    allCacheSpans.forEach(span => {
      expect(span.status).toBe('ok');
      expect(span.is_segment).toBe(false);
      expect(span.parent_span_id).toBeDefined();
    });
  });

  test('correctly tracks cache hits and misses for cachedFunction', async ({ request }) => {
    // Use a unique key for this test to ensure fresh cache state
    const uniqueUser = `test-${Date.now()}`;
    const uniqueData = `data-${Date.now()}`;

    const cacheSpansPromise = collectCacheSpans();

    await request.get(`/api/cache-test?user=${uniqueUser}&data=${uniqueData}`);

    // Get all cache-related spans
    const allCacheSpans = await cacheSpansPromise;

    // We should have cache operations
    expect(allCacheSpans.length).toBeGreaterThan(0);

    // Get all getItem operations
    const allGetItemSpans = allCacheSpans.filter(span => span.attributes['sentry.op']?.value === 'cache.get');

    // Get all setItem operations
    const allSetItemSpans = allCacheSpans.filter(span => span.attributes['sentry.op']?.value === 'cache.put');

    // We should have both get and set operations
    expect(allGetItemSpans.length).toBeGreaterThan(0);
    expect(allSetItemSpans.length).toBeGreaterThan(0);

    // Check for cache misses (cache.hit = false)
    const cacheMissSpans = allGetItemSpans.filter(
      span => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value === false,
    );

    // Check for cache hits (cache.hit = true)
    const cacheHitSpans = allGetItemSpans.filter(span => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value === true);

    // We should have at least one cache miss (first calls to getCachedUser and getCachedData)
    expect(cacheMissSpans.length).toBeGreaterThanOrEqual(1);

    // We should have at least one cache hit (second calls to getCachedUser and getCachedData)
    expect(cacheHitSpans.length).toBeGreaterThanOrEqual(1);
  });

  test('creates exactly one span for each cache read and write', async ({ request }) => {
    // Unique keys, so that the first call of each cached function is a cache miss.
    const uniqueKey = `count-${Date.now()}`;
    const spansPromise = collectRequestSpans();

    await request.get(`/api/cache-test?user=${uniqueKey}&data=${uniqueKey}`);

    const spans = await spansPromise;
    const readSpans = spans.filter(span => getSpanOp(span) === CACHE_GET);
    const writeSpans = spans.filter(span => getSpanOp(span) === CACHE_PUT);
    const cacheMissSpans = readSpans.filter(span => span.attributes[CACHE_HIT]?.value === false);

    // 3x getCachedUser, 2x getCachedData, 1x cachedHandler.
    expect(readSpans).toHaveLength(6);
    // One write for each cache miss. An earlier test can have filled the cache of the handler, so the number of
    // misses is not fixed.
    expect(writeSpans).toHaveLength(cacheMissSpans.length);
  });

  test('makes each cache span a child of the request root span', async ({ request }) => {
    const uniqueKey = `parent-${Date.now()}`;
    const spansPromise = collectRequestSpans();

    await request.get(`/api/cache-test?user=${uniqueKey}&data=${uniqueKey}`);

    const spans = await spansPromise;
    const rootSpan = spans.find(span => span.is_segment);
    const cacheSpans = spans.filter(span => getSpanOp(span) === CACHE_GET || getSpanOp(span) === CACHE_PUT);
    const parentSpanIds = new Set(cacheSpans.map(span => span.parent_span_id));

    expect(parentSpanIds).toEqual(new Set([rootSpan?.span_id]));
  });
});
