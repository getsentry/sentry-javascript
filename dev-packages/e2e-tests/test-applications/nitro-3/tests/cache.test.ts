import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/nitro';

test.describe('Cache Instrumentation', () => {
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments cachedFunction and cachedHandler calls and creates spans with correct attributes', async ({
    request,
  }) => {
    const transactionPromise = waitForTransaction('nitro-3', transactionEvent => {
      return transactionEvent.transaction?.includes('GET /api/test-cache') ?? false;
    });

    const response = await request.get('/api/test-cache');
    expect(response.status()).toBe(200);

    const transaction = await transactionPromise;

    const findSpansByOp = (op: string) => {
      return transaction.spans?.filter(span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === op) || [];
    };

    const allCacheSpans = transaction.spans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.cache.nitro',
    );
    expect(allCacheSpans?.length).toBeGreaterThan(0);

    // getItem spans for cachedFunction - should have both cache miss and cache hit
    const getItemSpans = findSpansByOp('cache.get_item');
    expect(getItemSpans.length).toBeGreaterThan(0);

    // Find cache miss (first call to getCachedUser('123'))
    const cacheMissSpan = getItemSpans.find(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('user:123') &&
        !span.data?.[SEMANTIC_ATTRIBUTE_CACHE_HIT],
    );
    expect(cacheMissSpan).toBeDefined();
    expect(cacheMissSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: false,
      'db.operation.name': 'getItem',
    });

    // Find cache hit (second call to getCachedUser('123'))
    const cacheHitSpan = getItemSpans.find(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('user:123') &&
        span.data?.[SEMANTIC_ATTRIBUTE_CACHE_HIT],
    );
    expect(cacheHitSpan).toBeDefined();
    expect(cacheHitSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'getItem',
    });

    // setItem spans for cachedFunction - when cache miss occurs, value is set
    const setItemSpans = findSpansByOp('cache.set_item');
    expect(setItemSpans.length).toBeGreaterThan(0);

    const cacheSetSpan = setItemSpans.find(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('user:123'),
    );
    expect(cacheSetSpan).toBeDefined();
    expect(cacheSetSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.set_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      'db.operation.name': 'setItem',
    });

    // Spans for different cached functions
    const dataKeySpans = getItemSpans.filter(
      span =>
        typeof span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === 'string' &&
        span.data[SEMANTIC_ATTRIBUTE_CACHE_KEY].includes('data:test-key'),
    );
    expect(dataKeySpans.length).toBeGreaterThan(0);

    // Spans for cachedHandler
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
    const uniqueUser = `test-${Date.now()}`;
    const uniqueData = `data-${Date.now()}`;

    const transactionPromise = waitForTransaction('nitro-3', transactionEvent => {
      return transactionEvent.transaction?.includes('GET /api/test-cache') ?? false;
    });

    await request.get(`/api/test-cache?user=${uniqueUser}&data=${uniqueData}`);
    const transaction = await transactionPromise;

    const allCacheSpans = transaction.spans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.cache.nitro',
    );
    expect(allCacheSpans?.length).toBeGreaterThan(0);

    const allGetItemSpans = allCacheSpans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'cache.get_item',
    );
    const allSetItemSpans = allCacheSpans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'cache.set_item',
    );

    expect(allGetItemSpans?.length).toBeGreaterThan(0);
    expect(allSetItemSpans?.length).toBeGreaterThan(0);

    const cacheMissSpans = allGetItemSpans?.filter(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_HIT] === false);
    const cacheHitSpans = allGetItemSpans?.filter(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_HIT] === true);

    // At least one cache miss (first calls to getCachedUser and getCachedData)
    expect(cacheMissSpans?.length).toBeGreaterThanOrEqual(1);

    // At least one cache hit (second calls to getCachedUser and getCachedData)
    expect(cacheHitSpans?.length).toBeGreaterThanOrEqual(1);
  });
});
