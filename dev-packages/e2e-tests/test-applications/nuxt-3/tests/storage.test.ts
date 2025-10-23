import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/nuxt';

test.describe('Storage Instrumentation', () => {
  const prefixKey = (key: string) => `test-storage:${key}`;
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments all storage operations and creates spans with correct attributes', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
      return transactionEvent.transaction?.includes('GET /api/storage-test') ?? false;
    });

    const response = await request.get('/api/storage-test');
    expect(response.status()).toBe(200);

    const transaction = await transactionPromise;

    // Helper to find spans by operation
    const findSpansByOp = (op: string) => {
      return transaction.spans?.filter(span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === op) || [];
    };

    // Test setItem spans
    const setItemSpans = findSpansByOp('cache.set_item');
    expect(setItemSpans.length).toBeGreaterThanOrEqual(1);
    const setItemSpan = setItemSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('user:123'));
    expect(setItemSpan).toBeDefined();
    expect(setItemSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.set_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('user:123'),
      'db.operation.name': 'setItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });

    expect(setItemSpan?.description).toBe(prefixKey('user:123'));

    // Test setItemRaw spans
    const setItemRawSpans = findSpansByOp('cache.set_item_raw');
    expect(setItemRawSpans.length).toBeGreaterThanOrEqual(1);

    const setItemRawSpan = setItemRawSpans.find(
      span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('raw:data'),
    );

    expect(setItemRawSpan).toBeDefined();
    expect(setItemRawSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.set_item_raw',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('raw:data'),
      'db.operation.name': 'setItemRaw',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });

    // Test hasItem spans - should have cache hit attribute
    const hasItemSpans = findSpansByOp('cache.has_item');
    expect(hasItemSpans.length).toBeGreaterThanOrEqual(1);
    const hasItemSpan = hasItemSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('user:123'));
    expect(hasItemSpan).toBeDefined();
    expect(hasItemSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.has_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('user:123'),
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'hasItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });

    // Test getItem spans - should have cache hit attribute
    const getItemSpans = findSpansByOp('cache.get_item');
    expect(getItemSpans.length).toBeGreaterThanOrEqual(1);
    const getItemSpan = getItemSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('user:123'));
    expect(getItemSpan).toBeDefined();
    expect(getItemSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('user:123'),
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'getItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });
    expect(getItemSpan?.description).toBe(prefixKey('user:123'));

    // Test getItemRaw spans - should have cache hit attribute
    const getItemRawSpans = findSpansByOp('cache.get_item_raw');
    expect(getItemRawSpans.length).toBeGreaterThanOrEqual(1);
    const getItemRawSpan = getItemRawSpans.find(
      span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('raw:data'),
    );
    expect(getItemRawSpan).toBeDefined();
    expect(getItemRawSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_item_raw',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('raw:data'),
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'getItemRaw',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });

    // Test getKeys spans
    const getKeysSpans = findSpansByOp('cache.get_keys');
    expect(getKeysSpans.length).toBeGreaterThanOrEqual(1);
    expect(getKeysSpans[0]?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_keys',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      'db.operation.name': 'getKeys',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });

    // Test removeItem spans
    const removeItemSpans = findSpansByOp('cache.remove_item');
    expect(removeItemSpans.length).toBeGreaterThanOrEqual(1);
    const removeItemSpan = removeItemSpans.find(
      span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('batch:1'),
    );
    expect(removeItemSpan).toBeDefined();
    expect(removeItemSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.remove_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('batch:1'),
      'db.operation.name': 'removeItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });

    // Test clear spans
    const clearSpans = findSpansByOp('cache.clear');
    expect(clearSpans.length).toBeGreaterThanOrEqual(1);
    expect(clearSpans[0]?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.clear',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      'db.operation.name': 'clear',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });

    // Verify all spans have OK status
    const allStorageSpans = transaction.spans?.filter(
      span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.cache.nuxt',
    );
    expect(allStorageSpans?.length).toBeGreaterThan(0);
    allStorageSpans?.forEach(span => {
      expect(span.status).toBe('ok');
    });
  });
});
