import { URL_PATH } from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { isViteServer, NITRO_ONLY } from './isViteServer';

test.skip(isViteServer, NITRO_ONLY);

async function collectStorageSpans(route: string) {
  const spans = await collectStreamedSpansUntilSegment(
    'nuxt-4',
    span => span.attributes['url.path']?.value === route,
    span => span.attributes['sentry.origin']?.value === 'auto.cache.nuxt',
  );
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === route);

  return spans.filter(
    span => span.trace_id === rootSpan?.trace_id && span.attributes['sentry.origin']?.value === 'auto.cache.nuxt',
  );
}

const STORAGE_OPS: ReadonlyArray<string | undefined> = [CACHE_GET, CACHE_PUT, CACHE_REMOVE];
const isStorageSpan = (span: SerializedStreamedSpan) => STORAGE_OPS.includes(getSpanOp(span));

/** Every span of the request's trace, whatever created it, so that a second span for one storage call shows up. */
function collectRequestSpans(route: string) {
  return collectStreamedSpansUntilSegment('nuxt-4', span => span.attributes[URL_PATH]?.value === route, isStorageSpan);
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
      'cache.operation': { type: 'string', value: 'put' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('user:123') },
      'db.operation.name': { type: 'string', value: 'setItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });

    expect(setItemSpan?.name).toBe('cache.put');

    // Test setItemRaw spans
    expect(findSpansByMethod('setItemRaw').length).toBeGreaterThanOrEqual(1);
    const setItemRawSpan = findSpanByCacheKey('setItemRaw', prefixKey('raw:data'));

    expect(setItemRawSpan).toBeDefined();
    expect(setItemRawSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.put' },
      'cache.operation': { type: 'string', value: 'put' },
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
      'cache.operation': { type: 'string', value: 'get' },
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
      'cache.operation': { type: 'string', value: 'get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nuxt' },
      [SEMANTIC_ATTRIBUTE_CACHE_KEY]: { type: 'string', value: prefixKey('user:123') },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'getItem' },
      'db.collection.name': { type: 'string', value: 'test-storage' },
      'db.system.name': { type: 'string', value: 'memory' },
    });
    expect(getItemSpan?.name).toBe('cache.get');

    // Test getItemRaw spans - should have cache hit attribute
    expect(findSpansByMethod('getItemRaw').length).toBeGreaterThanOrEqual(1);
    const getItemRawSpan = findSpanByCacheKey('getItemRaw', prefixKey('raw:data'));
    expect(getItemRawSpan).toBeDefined();
    expect(getItemRawSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'cache.operation': { type: 'string', value: 'get' },
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
      'cache.operation': { type: 'string', value: 'get' },
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
      'cache.operation': { type: 'string', value: 'remove' },
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
      'cache.operation': { type: 'string', value: 'remove' },
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

  test('creates exactly one span for each storage driver call', async ({ request }) => {
    const spansPromise = collectRequestSpans('/api/storage-test');

    await request.get('/api/storage-test');

    const spanOps = (await spansPromise).map(getSpanOp);

    // `/api/storage-test` writes 4 items, reads with hasItem, getItem, getItemRaw and 2x getKeys, and removes twice
    // (removeItem, clear). Each `getKeys` call is 2 driver calls, because unstorage also asks the driver of the root mount.
    expect(spanOps.filter(op => op === CACHE_PUT)).toHaveLength(4);
    expect(spanOps.filter(op => op === CACHE_GET)).toHaveLength(7);
    expect(spanOps.filter(op => op === CACHE_REMOVE)).toHaveLength(2);
  });

  test('makes each storage span a child of the request root span', async ({ request }) => {
    const spansPromise = collectRequestSpans('/api/storage-test');

    await request.get('/api/storage-test');

    const spans = await spansPromise;
    const rootSpan = spans.find(span => span.is_segment);
    const parentSpanIds = new Set(spans.filter(isStorageSpan).map(span => span.parent_span_id));

    expect(parentSpanIds).toEqual(new Set([rootSpan?.span_id]));
  });
});
