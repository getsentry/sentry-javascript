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

test.describe('Storage Instrumentation - Aliases', () => {
  const prefixKey = (key: string) => `cache:${key}`;
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  test('instruments storage alias methods (get, set, has, del, remove) and creates spans', async ({ request }) => {
    const storageSpansPromise = collectStorageSpans('/api/test-storage-aliases');

    const response = await request.get('/api/test-storage-aliases');
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
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:user') },
      'db.operation.name': { type: 'string', value: 'setItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });
    expect(setSpan?.name).toBe(prefixKey('alias:user'));

    // Test get (alias for getItem)
    expect(findSpansByMethod('getItem').length).toBeGreaterThanOrEqual(1);
    const getSpan = findByKey('getItem', prefixKey('alias:user'));
    expect(getSpan).toBeDefined();
    expect(getSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:user') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'getItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });
    expect(getSpan?.name).toBe(prefixKey('alias:user'));

    // Test has (alias for hasItem)
    expect(findSpansByMethod('hasItem').length).toBeGreaterThanOrEqual(1);
    const hasSpan = findByKey('hasItem', prefixKey('alias:user'));
    expect(hasSpan).toBeDefined();
    expect(hasSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:user') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'hasItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });

    // Test del and remove (both aliases for removeItem)
    expect(findSpansByMethod('removeItem').length).toBeGreaterThanOrEqual(2);

    const delSpan = findByKey('removeItem', prefixKey('alias:temp1'));
    expect(delSpan).toBeDefined();
    expect(delSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.remove' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:temp1') },
      'db.operation.name': { type: 'string', value: 'removeItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });
    expect(delSpan?.name).toBe(prefixKey('alias:temp1'));

    const removeSpan = findByKey('removeItem', prefixKey('alias:temp2'));
    expect(removeSpan).toBeDefined();
    expect(removeSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.remove' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('alias:temp2') },
      'db.operation.name': { type: 'string', value: 'removeItem' },
      'db.system.name': { type: 'string', value: expect.any(String) },
    });
    expect(removeSpan?.name).toBe(prefixKey('alias:temp2'));

    // Verify all spans have OK status
    expect(allStorageSpans.length).toBeGreaterThan(0);
    allStorageSpans.forEach(span => {
      expect(span.status).toBe('ok');
    });
  });
});
