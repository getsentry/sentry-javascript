import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/nuxt';

test.describe('Cache Instrumentation', () => {
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments cachedFunction and cachedEventHandler calls and creates spans with correct attributes', async ({
    request,
  }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction?.includes('GET /api/cache-test') ?? false;
    });

    const response = await request.get('/api/cache-test');
    expect(response.status()).toBe(200);

    const transaction = await transactionPromise;

    // Helper to find spans by operation
    const findSpansByOp = (op: string) => {
      return transaction.spans?.filter(span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === op) || [];
    };

    // Test that we have cache operations from cachedFunction and cachedEventHandler
    const allCacheSpans = transaction.spans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.cache.nuxt',
    );
    expect(allCacheSpans?.length).toBeGreaterThan(0);

    // Test getItem spans for cachedFunction - should have both cache miss and cache hit
    const getItemSpans = findSpansByOp('cache.get_item');
    expect(getItemSpans.length).toBeGreaterThan(0);

    // Find cache miss (first call to getCachedUser('123'))
    const cacheMissSpan = getItemSpans.find(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('user:123') &&
        !span.data?.[SEMANTIC_ATTRIBUTE_CACHE_HIT],
    );
    if (cacheMissSpan) {
      expect(cacheMissSpan.data).toMatchObject({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_item',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
        [SEMANTIC_ATTRIBUTE_CACHE_HIT]: false,
        'db.operation.name': 'getItem',
        'db.collection.name': expect.stringMatching(/^(cache)?$/),
      });
    }

    // Find cache hit (second call to getCachedUser('123'))
    const cacheHitSpan = getItemSpans.find(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('user:123') &&
        span.data?.[SEMANTIC_ATTRIBUTE_CACHE_HIT],
    );
    if (cacheHitSpan) {
      expect(cacheHitSpan.data).toMatchObject({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_item',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
        [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
        'db.operation.name': 'getItem',
        'db.collection.name': expect.stringMatching(/^(cache)?$/),
      });
    }

    // Test setItem spans for cachedFunction - when cache miss occurs, value is set
    const setItemSpans = findSpansByOp('cache.set_item');
    expect(setItemSpans.length).toBeGreaterThan(0);

    const cacheSetSpan = setItemSpans.find(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('user:123'),
    );
    if (cacheSetSpan) {
      expect(cacheSetSpan.data).toMatchObject({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.set_item',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
        'db.operation.name': 'setItem',
        'db.collection.name': expect.stringMatching(/^(cache)?$/),
      });
    }

    // Test that we have spans for different cached functions
    const dataKeySpans = getItemSpans.filter(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('data:test-key'),
    );
    expect(dataKeySpans.length).toBeGreaterThan(0);

    // Test that we have spans for cachedEventHandler
    const cachedHandlerSpans = getItemSpans.filter(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('cachedHandler'),
    );
    expect(cachedHandlerSpans.length).toBeGreaterThan(0);

    // Verify all cache spans have OK status
    allCacheSpans?.forEach(span => {
      expect(span.status).toBe('ok');
    });

    // Verify cache spans are properly nested under the transaction
    allCacheSpans?.forEach(span => {
      expect(span.parent_span_id).toBeDefined();
    });
  });

  test('correctly tracks cache hits and misses for cachedFunction', async ({ request }) => {
    // Use a unique key for this test to ensure fresh cache state
    const uniqueUser = `test-${Date.now()}`;
    const uniqueData = `data-${Date.now()}`;

    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction?.includes('GET /api/cache-test') ?? false;
    });

    await request.get(`/api/cache-test?user=${uniqueUser}&data=${uniqueData}`);
    const transaction1 = await transactionPromise;

    // Get all cache-related spans
    const allCacheSpans = transaction1.spans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.cache.nuxt',
    );

    // We should have cache operations
    expect(allCacheSpans?.length).toBeGreaterThan(0);

    // Get all getItem operations
    const allGetItemSpans = allCacheSpans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'cache.get_item',
    );

    // Get all setItem operations
    const allSetItemSpans = allCacheSpans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'cache.set_item',
    );

    // We should have both get and set operations
    expect(allGetItemSpans?.length).toBeGreaterThan(0);
    expect(allSetItemSpans?.length).toBeGreaterThan(0);

    // Check for cache misses (cache.hit = false)
    const cacheMissSpans = allGetItemSpans?.filter(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_HIT] === false);

    // Check for cache hits (cache.hit = true)
    const cacheHitSpans = allGetItemSpans?.filter(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_HIT] === true);

    // We should have at least one cache miss (first calls to getCachedUser and getCachedData)
    expect(cacheMissSpans?.length).toBeGreaterThanOrEqual(1);

    // We should have at least one cache hit (second calls to getCachedUser and getCachedData)
    expect(cacheHitSpans?.length).toBeGreaterThanOrEqual(1);
  });
});
