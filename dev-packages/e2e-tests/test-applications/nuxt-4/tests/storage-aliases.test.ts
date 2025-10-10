import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/nuxt';

test.describe('Storage Instrumentation - Aliases', () => {
  const prefixKey = (key: string) => `test-storage:${key}`;
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments storage alias methods (get, set, has, del, remove) and creates spans', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction?.includes('GET /api/storage-aliases-test') ?? false;
    });

    const response = await request.get('/api/storage-aliases-test');
    expect(response.status()).toBe(200);

    const transaction = await transactionPromise;

    // Helper to find spans by operation
    const findSpansByOp = (op: string) => {
      return transaction.spans?.filter(span => span.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === op) || [];
    };

    // Test set (alias for setItem)
    const setSpans = findSpansByOp('cache.set_item');
    expect(setSpans.length).toBeGreaterThanOrEqual(1);
    const setSpan = setSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('alias:user'));
    expect(setSpan).toBeDefined();
    expect(setSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.set_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('alias:user'),
      'db.operation.name': 'setItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });
    expect(setSpan?.description).toBe(prefixKey('alias:user'));

    // Test get (alias for getItem)
    const getSpans = findSpansByOp('cache.get_item');
    expect(getSpans.length).toBeGreaterThanOrEqual(1);
    const getSpan = getSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('alias:user'));
    expect(getSpan).toBeDefined();
    expect(getSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('alias:user'),
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'getItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });
    expect(getSpan?.description).toBe(prefixKey('alias:user'));

    // Test has (alias for hasItem)
    const hasSpans = findSpansByOp('cache.has_item');
    expect(hasSpans.length).toBeGreaterThanOrEqual(1);
    const hasSpan = hasSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('alias:user'));
    expect(hasSpan).toBeDefined();
    expect(hasSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.has_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('alias:user'),
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: true,
      'db.operation.name': 'hasItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });

    // Test del and remove (both aliases for removeItem)
    const removeSpans = findSpansByOp('cache.remove_item');
    expect(removeSpans.length).toBeGreaterThanOrEqual(2); // Should have both del and remove calls

    const delSpan = removeSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('alias:temp1'));
    expect(delSpan).toBeDefined();
    expect(delSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.remove_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('alias:temp1'),
      'db.operation.name': 'removeItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });
    expect(delSpan?.description).toBe(prefixKey('alias:temp1'));

    const removeSpan = removeSpans.find(span => span.data?.[SEMANTIC_ATTRIBUTE_CACHE_KEY] === prefixKey('alias:temp2'));
    expect(removeSpan).toBeDefined();
    expect(removeSpan?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.remove_item',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.cache.nuxt',
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: prefixKey('alias:temp2'),
      'db.operation.name': 'removeItem',
      'db.collection.name': 'test-storage',
      'db.system.name': 'memory',
    });
    expect(removeSpan?.description).toBe(prefixKey('alias:temp2'));

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
