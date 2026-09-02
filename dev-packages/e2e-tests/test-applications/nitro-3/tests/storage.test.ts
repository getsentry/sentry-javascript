import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

// Streamed spans arrive across several envelopes (a child can flush before its segment),
// so accumulate until the segment span has arrived and filter by its trace.
async function collectStorageSpans(route: string) {
  const spans = await collectStreamedSpans('nitro-3', spans =>
    spans.some(span => span.is_segment && span.attributes['url.path']?.value === route),
  );
  const segmentSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === route);

  return spans.filter(
    span => span.trace_id === segmentSpan?.trace_id && span.attributes['sentry.origin']?.value === 'auto.cache.nitro',
  );
}

test.describe('Storage Instrumentation', () => {
  const prefixKey = (key: string) => `cache:${key}`;
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments all storage operations and creates spans with correct attributes', async ({ request }) => {
    const storageSpansPromise = collectStorageSpans('/api/test-storage');

    const response = await request.get('/api/test-storage');
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
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('user:123') },
      'db.operation.name': { type: 'string', value: 'setItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });
    expect(setItemSpan?.name).toBe(prefixKey('user:123'));

    // Test setItemRaw spans
    expect(findSpansByMethod('setItemRaw').length).toBeGreaterThanOrEqual(1);
    const setItemRawSpan = findSpanByCacheKey('setItemRaw', prefixKey('raw:data'));
    expect(setItemRawSpan).toBeDefined();
    expect(setItemRawSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.put' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('raw:data') },
      'db.operation.name': { type: 'string', value: 'setItemRaw' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });

    // Test hasItem spans - should have cache hit attribute
    expect(findSpansByMethod('hasItem').length).toBeGreaterThanOrEqual(1);
    const hasItemSpan = findSpanByCacheKey('hasItem', prefixKey('user:123'));
    expect(hasItemSpan).toBeDefined();
    expect(hasItemSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('user:123') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'hasItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });

    // Test getItem spans - should have cache hit attribute
    expect(findSpansByMethod('getItem').length).toBeGreaterThanOrEqual(1);
    const getItemSpan = findSpanByCacheKey('getItem', prefixKey('user:123'));
    expect(getItemSpan).toBeDefined();
    expect(getItemSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('user:123') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'getItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });
    expect(getItemSpan?.name).toBe(prefixKey('user:123'));

    // Test getItemRaw spans - should have cache hit attribute
    expect(findSpansByMethod('getItemRaw').length).toBeGreaterThanOrEqual(1);
    const getItemRawSpan = findSpanByCacheKey('getItemRaw', prefixKey('raw:data'));
    expect(getItemRawSpan).toBeDefined();
    expect(getItemRawSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('raw:data') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'getItemRaw' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });

    // Test getKeys spans
    const getKeysSpans = findSpansByMethod('getKeys');
    expect(getKeysSpans.length).toBeGreaterThanOrEqual(1);
    expect(getKeysSpans[0]?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      'db.operation.name': { type: 'string', value: 'getKeys' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });

    // Test removeItem spans
    expect(findSpansByMethod('removeItem').length).toBeGreaterThanOrEqual(1);
    const removeItemSpan = findSpanByCacheKey('removeItem', prefixKey('batch:1'));
    expect(removeItemSpan).toBeDefined();
    expect(removeItemSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.remove' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('batch:1') },
      'db.operation.name': { type: 'string', value: 'removeItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });

    // Test clear spans
    const clearSpans = findSpansByMethod('clear');
    expect(clearSpans.length).toBeGreaterThanOrEqual(1);
    expect(clearSpans[0]?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.remove' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      'db.operation.name': { type: 'string', value: 'clear' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });

    // Verify all spans have OK status
    expect(allStorageSpans.length).toBeGreaterThan(0);
    allStorageSpans.forEach(span => {
      expect(span.status).toBe('ok');
    });
  });
});
