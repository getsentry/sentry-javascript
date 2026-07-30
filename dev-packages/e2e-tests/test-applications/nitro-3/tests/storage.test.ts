import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/nitro';

test.describe('Storage Instrumentation', () => {
  const prefixKey = (key: string) => `cache:${key}`;
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments all storage operations and creates spans with correct attributes', async ({ request }) => {
    const transactionPromise = waitForTransaction('nitro-3', transactionEvent => {
      return transactionEvent.transaction?.includes('GET /api/test-storage') ?? false;
    });

    const response = await request.get('/api/test-storage');
    expect(response.status()).toBe(200);

    const transaction = await transactionPromise;

    // Helper to find spans by operation
    const findSpansByMethod = (method: string) => {
      return transaction.spans?.filter(span => span.data?.['db.operation.name'] === method) || [];
    };

    // Test setItem spans
    const setItemSpans = findSpansByMethod('setItem');
    expect(setItemSpans.length).toBeGreaterThanOrEqual(1);
    const setItemSpan = setItemSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('user:123'));
    expect(setItemSpan).toBeDefined();
    expect(setItemSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.put',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('user:123'),
      'db.operation.name': 'setItem',
      'db.system.name': expect.any(String),
    });
    expect(setItemSpan?.description).toBe(prefixKey('user:123'));

    // Test setItemRaw spans
    const setItemRawSpans = findSpansByMethod('setItemRaw');
    expect(setItemRawSpans.length).toBeGreaterThanOrEqual(1);
    const setItemRawSpan = setItemRawSpans.find(
      span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('raw:data'),
    );
    expect(setItemRawSpan).toBeDefined();
    expect(setItemRawSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.put',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('raw:data'),
      'db.operation.name': 'setItemRaw',
      'db.system.name': expect.any(String),
    });

    // Test hasItem spans - should have cache hit attribute
    const hasItemSpans = findSpansByMethod('hasItem');
    expect(hasItemSpans.length).toBeGreaterThanOrEqual(1);
    const hasItemSpan = hasItemSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('user:123'));
    expect(hasItemSpan).toBeDefined();
    expect(hasItemSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('user:123'),
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'hasItem',
      'db.system.name': expect.any(String),
    });

    // Test getItem spans - should have cache hit attribute
    const getItemSpans = findSpansByMethod('getItem');
    expect(getItemSpans.length).toBeGreaterThanOrEqual(1);
    const getItemSpan = getItemSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('user:123'));
    expect(getItemSpan).toBeDefined();
    expect(getItemSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('user:123'),
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'getItem',
      'db.system.name': expect.any(String),
    });
    expect(getItemSpan?.description).toBe(prefixKey('user:123'));

    // Test getItemRaw spans - should have cache hit attribute
    const getItemRawSpans = findSpansByMethod('getItemRaw');
    expect(getItemRawSpans.length).toBeGreaterThanOrEqual(1);
    const getItemRawSpan = getItemRawSpans.find(
      span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('raw:data'),
    );
    expect(getItemRawSpan).toBeDefined();
    expect(getItemRawSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('raw:data'),
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'getItemRaw',
      'db.system.name': expect.any(String),
    });

    // Test getKeys spans
    const getKeysSpans = findSpansByMethod('getKeys');
    expect(getKeysSpans.length).toBeGreaterThanOrEqual(1);
    expect(getKeysSpans[0]?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      'db.operation.name': 'getKeys',
      'db.system.name': expect.any(String),
    });

    // Test removeItem spans
    const removeItemSpans = findSpansByMethod('removeItem');
    expect(removeItemSpans.length).toBeGreaterThanOrEqual(1);
    const removeItemSpan = removeItemSpans.find(
      span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('batch:1'),
    );
    expect(removeItemSpan).toBeDefined();
    expect(removeItemSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.remove',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('batch:1'),
      'db.operation.name': 'removeItem',
      'db.system.name': expect.any(String),
    });

    // Test clear spans
    const clearSpans = findSpansByMethod('clear');
    expect(clearSpans.length).toBeGreaterThanOrEqual(1);
    expect(clearSpans[0]?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.remove',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nitro',
      'db.operation.name': 'clear',
      'db.system.name': expect.any(String),
    });

    // Verify all spans have OK status
    const allStorageSpans = transaction.spans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.cache.nitro',
    );
    expect(allStorageSpans?.length).toBeGreaterThan(0);
    allStorageSpans?.forEach(span => {
      expect(span.status).toBe('ok');
    });
  });
});
