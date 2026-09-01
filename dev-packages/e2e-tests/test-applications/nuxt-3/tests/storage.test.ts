import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

async function collectStorageSpans(route: string) {
  const spans = await collectStreamedSpans('nuxt-3', spans =>
    spans.some(span => span.is_segment && span.attributes['url.path']?.value === route),
  );
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === route);

  return spans.filter(
    span => span.trace_id === rootSpan?.trace_id && span.attributes['sentry.origin']?.value === 'auto.cache.nuxt',
  );
}

test.describe('Storage Instrumentation', () => {
  const prefixKey = (key: string) => `test-storage:${key}`;
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments all storage operations and creates spans with correct attributes', async ({ request }) => {
    const storageSpansPromise = collectStorageSpans('/api/storage-test');

    const response = await request.get('/api/storage-test');
    expect(response.status()).toBe(200);

    const allStorageSpans = await storageSpansPromise;

    // Helper to find spans by operation
    const findSpansByMethod = (method: string) =>
      allStorageSpans.filter(span => span.attributes['db.operation.name']?.value === method);

    const findSpanByCacheKey = (method: string, key: string) =>
      findSpansByMethod(method).find(span => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_KEY]?.value === key);

    // Test setItem spans
    expect(findSpansByMethod('setItem').length).toBeGreaterThanOrEqual(1);
    const setItemSpan = findSpanByCacheKey('setItem', prefixKey('user:123'));
    expect(setItemSpan).toBeDefined();
    expect(setItemSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.put' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('user:123') },
      'db.operation.name': { type: 'string', value: 'setItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    expect(setItemSpan?.name).toBe(prefixKey('user:123'));

    // Test setItemRaw spans
    expect(findSpansByMethod('setItemRaw').length).toBeGreaterThanOrEqual(1);
    const setItemRawSpan = findSpanByCacheKey('setItemRaw', prefixKey('raw:data'));

    expect(setItemRawSpan).toBeDefined();
    expect(setItemRawSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.put' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('raw:data') },
      'db.operation.name': { type: 'string', value: 'setItemRaw' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    // Test hasItem spans - should have cache hit attribute
    expect(findSpansByMethod('hasItem').length).toBeGreaterThanOrEqual(1);
    const hasItemSpan = findSpanByCacheKey('hasItem', prefixKey('user:123'));
    expect(hasItemSpan).toBeDefined();
    expect(hasItemSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('user:123') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'hasItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    // Test getItem spans - should have cache hit attribute
    expect(findSpansByMethod('getItem').length).toBeGreaterThanOrEqual(1);
    const getItemSpan = findSpanByCacheKey('getItem', prefixKey('user:123'));
    expect(getItemSpan).toBeDefined();
    expect(getItemSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('user:123') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'getItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });
    expect(getItemSpan?.name).toBe(prefixKey('user:123'));

    // Test getItemRaw spans - should have cache hit attribute
    expect(findSpansByMethod('getItemRaw').length).toBeGreaterThanOrEqual(1);
    const getItemRawSpan = findSpanByCacheKey('getItemRaw', prefixKey('raw:data'));
    expect(getItemRawSpan).toBeDefined();
    expect(getItemRawSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('raw:data') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'getItemRaw' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    // Test getKeys spans
    const getKeysSpans = findSpansByMethod('getKeys');
    expect(getKeysSpans.length).toBeGreaterThanOrEqual(1);
    expect(getKeysSpans[0]?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      'db.operation.name': { type: 'string', value: 'getKeys' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    // Test removeItem spans
    expect(findSpansByMethod('removeItem').length).toBeGreaterThanOrEqual(1);
    const removeItemSpan = findSpanByCacheKey('removeItem', prefixKey('batch:1'));
    expect(removeItemSpan).toBeDefined();
    expect(removeItemSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.remove' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('batch:1') },
      'db.operation.name': { type: 'string', value: 'removeItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    // Test clear spans
    const clearSpans = findSpansByMethod('clear');
    expect(clearSpans.length).toBeGreaterThanOrEqual(1);
    expect(clearSpans[0]?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.remove' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      'db.operation.name': { type: 'string', value: 'clear' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    // Verify all spans have OK status
    expect(allStorageSpans.length).toBeGreaterThan(0);
    allStorageSpans.forEach(span => {
      expect(span.status).toBe('ok');
    });
  });
});
