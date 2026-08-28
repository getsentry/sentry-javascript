import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

// Streamed spans are flushed across multiple envelopes as they end, so spans of one request arrive
// spread over several envelopes, interleaved with spans of earlier requests that are still buffered.
// Accumulate until the request's root span is seen, then keep only the spans of its trace.
//
// The root span is matched on `url.path`: with span streaming its name is only parameterized once the
// route resolves, which doesn't happen for un-parameterized routes or requests that end in an error.
async function collectStorageSpans(route: string) {
  const spans = await collectStreamedSpans('nuxt-3', spans =>
    spans.some(span => span.is_segment && span.attributes['url.path']?.value === route),
  );
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === route);

  return spans.filter(
    span => span.trace_id === rootSpan?.trace_id && span.attributes['sentry.origin']?.value === 'auto.cache.nuxt',
  );
}

test.describe('Storage Instrumentation - Aliases', () => {
  const prefixKey = (key: string) => `test-storage:${key}`;
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments storage alias methods (get, set, has, del, remove) and creates spans', async ({ request }) => {
    const storageSpansPromise = collectStorageSpans('/api/storage-aliases-test');

    const response = await request.get('/api/storage-aliases-test');
    expect(response.status()).toBe(200);

    const allStorageSpans = await storageSpansPromise;

    // Helper to find spans by operation
    const findSpansByMethod = (method: string) =>
      allStorageSpans.filter(span => span.attributes['db.operation.name']?.value === method);

    const findByKey = (method: string, key: string) =>
      findSpansByMethod(method).find(span => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_KEY]?.value === key);

    // Test set (alias for setItem)
    expect(findSpansByMethod('setItem').length).toBeGreaterThanOrEqual(1);
    const setSpan = findByKey('setItem', prefixKey('alias:user'));
    expect(setSpan).toBeDefined();
    expect(setSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.put' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:user') },
      'db.operation.name': { type: 'string', value: 'setItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });
    expect(setSpan?.name).toBe(prefixKey('alias:user'));

    // Test get (alias for getItem)
    expect(findSpansByMethod('getItem').length).toBeGreaterThanOrEqual(1);
    const getSpan = findByKey('getItem', prefixKey('alias:user'));
    expect(getSpan).toBeDefined();
    expect(getSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:user') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'getItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });
    expect(getSpan?.name).toBe(prefixKey('alias:user'));

    // Test has (alias for hasItem)
    expect(findSpansByMethod('hasItem').length).toBeGreaterThanOrEqual(1);
    const hasSpan = findByKey('hasItem', prefixKey('alias:user'));
    expect(hasSpan).toBeDefined();
    expect(hasSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:user') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'hasItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    // Test del and remove (both aliases for removeItem)
    expect(findSpansByMethod('removeItem').length).toBeGreaterThanOrEqual(2); // Should have both del and remove calls

    const delSpan = findByKey('removeItem', prefixKey('alias:temp1'));
    expect(delSpan).toBeDefined();
    expect(delSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.remove' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:temp1') },
      'db.operation.name': { type: 'string', value: 'removeItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });
    expect(delSpan?.name).toBe(prefixKey('alias:temp1'));

    const removeSpan = findByKey('removeItem', prefixKey('alias:temp2'));
    expect(removeSpan).toBeDefined();
    expect(removeSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.remove' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:temp2') },
      'db.operation.name': { type: 'string', value: 'removeItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });
    expect(removeSpan?.name).toBe(prefixKey('alias:temp2'));

    // Verify all spans have OK status
    expect(allStorageSpans.length).toBeGreaterThan(0);
    allStorageSpans.forEach(span => {
      expect(span.status).toBe('ok');
    });
  });
});
