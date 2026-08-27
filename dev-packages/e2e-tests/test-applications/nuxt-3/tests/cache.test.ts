import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

test.describe('Cache Instrumentation', () => {
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  // Streamed spans are flushed across multiple envelopes as they end, so the cache child spans can
  // arrive in a different envelope than the `is_segment` root span. Accumulate until the root is seen.
  function collectCacheSpans() {
    return collectStreamedSpans('nuxt-3', spans =>
      spans.some(span => span.name === 'GET /api/cache-test' && span.is_segment),
    ).then(spans => spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.cache.nuxt'));
  }

  test('instruments cachedFunction and cachedEventHandler calls and creates spans with correct attributes', async ({
    request,
  }) => {
    const cacheSpansPromise = collectCacheSpans();

    const response = await request.get('/api/cache-test?user=123&data=test-key');
    expect(response.status()).toBe(200);

    const allCacheSpans = await cacheSpansPromise;
    expect(allCacheSpans.length).toBeGreaterThan(0);

    // Helper to find spans by operation
    const findSpansByMethod = (method: string) =>
      allCacheSpans.filter(span => span.attributes['db.operation.name']?.value === method);

    const keyOf = (span: (typeof allCacheSpans)[number]) => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_KEY]?.value;

    // Test getItem spans for cachedFunction - should have both cache miss and cache hit
    const getItemSpans = findSpansByMethod('getItem');
    expect(getItemSpans.length).toBeGreaterThan(0);

    // Find cache miss (first call to getCachedUser('123'))
    const cacheMissSpan = getItemSpans.find(
      span =>
        typeof keyOf(span) === 'string' &&
        (keyOf(span) as string).includes('user:123') &&
        !span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value,
    );
    if (cacheMissSpan) {
      expect(cacheMissSpan.attributes).toMatchObject({
        'sentry.op': { type: 'string', value: 'cache.get' },
        'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
        [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: false },
        'db.operation.name': { type: 'string', value: 'getItem' },
      });
      expect(cacheMissSpan.attributes['db.collection.name']?.value).toMatch(/^(cache)?$/);
    }

    // Find cache hit (second call to getCachedUser('123'))
    const cacheHitSpan = getItemSpans.find(
      span =>
        typeof keyOf(span) === 'string' &&
        (keyOf(span) as string).includes('user:123') &&
        span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value,
    );
    if (cacheHitSpan) {
      expect(cacheHitSpan.attributes).toMatchObject({
        'sentry.op': { type: 'string', value: 'cache.get' },
        'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
        [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
        'db.operation.name': { type: 'string', value: 'getItem' },
      });
      expect(cacheHitSpan.attributes['db.collection.name']?.value).toMatch(/^(cache)?$/);
    }

    // Test setItem spans for cachedFunction - when cache miss occurs, value is set
    const setItemSpans = findSpansByMethod('setItem');
    expect(setItemSpans.length).toBeGreaterThan(0);

    const cacheSetSpan = setItemSpans.find(
      span => typeof keyOf(span) === 'string' && (keyOf(span) as string).includes('user:123'),
    );
    if (cacheSetSpan) {
      expect(cacheSetSpan.attributes).toMatchObject({
        'sentry.op': { type: 'string', value: 'cache.put' },
        'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
        'db.operation.name': { type: 'string', value: 'setItem' },
      });
      expect(cacheSetSpan.attributes['db.collection.name']?.value).toMatch(/^(cache)?$/);
    }

    // Test that we have spans for different cached functions
    const dataKeySpans = getItemSpans.filter(
      span => typeof keyOf(span) === 'string' && (keyOf(span) as string).includes('data:test-key'),
    );
    expect(dataKeySpans.length).toBeGreaterThan(0);

    // Test that we have spans for cachedEventHandler
    const cachedHandlerSpans = getItemSpans.filter(
      span => typeof keyOf(span) === 'string' && (keyOf(span) as string).includes('cachedHandler'),
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
});
