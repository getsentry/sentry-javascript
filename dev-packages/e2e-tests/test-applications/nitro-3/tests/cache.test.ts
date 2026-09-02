import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

test.describe('Cache Instrumentation', () => {
  const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';
  const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

  // Streamed spans arrive across several envelopes (a child can flush before its segment),
  // so accumulate until the segment span has arrived and filter by its trace.
  async function collectCacheSpans() {
    const spans = await collectStreamedSpans('nitro-3', spans =>
      spans.some(span => span.is_segment && span.attributes['url.path']?.value === '/api/test-cache'),
    );
    const segmentSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/api/test-cache');

    return spans.filter(
      span => span.trace_id === segmentSpan?.trace_id && span.attributes['sentry.origin']?.value === 'auto.cache.nitro',
    );
  }

  test('instruments cachedFunction and cachedHandler calls and creates spans with correct attributes', async ({
    request,
  }) => {
    const cacheSpansPromise = collectCacheSpans();

    const response = await request.get('/api/test-cache');
    expect(response.status()).toBe(200);

    const allCacheSpans = await cacheSpansPromise;
    expect(allCacheSpans.length).toBeGreaterThan(0);

    const findSpansByMethod = (method: string) =>
      allCacheSpans.filter(span => span.attributes['db.operation.name']?.value === method);

    const getCacheKey = (span: (typeof allCacheSpans)[number]) => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_KEY]?.value;

    // getItem spans for cachedFunction - should have both cache miss and cache hit
    const getItemSpans = findSpansByMethod('getItem');
    expect(getItemSpans.length).toBeGreaterThan(0);

    // Find cache miss (first call to getCachedUser('123'))
    const cacheMissSpan = getItemSpans.find(
      span =>
        typeof getCacheKey(span) === 'string' &&
        (getCacheKey(span) as string).includes('user:123') &&
        !span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value,
    );
    expect(cacheMissSpan).toBeDefined();
    expect(cacheMissSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: false },
      'db.operation.name': { type: 'string', value: 'getItem' },
    });

    // Find cache hit (second call to getCachedUser('123'))
    const cacheHitSpan = getItemSpans.find(
      span =>
        typeof getCacheKey(span) === 'string' &&
        (getCacheKey(span) as string).includes('user:123') &&
        span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value,
    );
    expect(cacheHitSpan).toBeDefined();
    expect(cacheHitSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.get' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      [SEMANTIC_ATTRIBUTE_CACHE_HIT]: { type: 'boolean', value: true },
      'db.operation.name': { type: 'string', value: 'getItem' },
    });

    // setItem spans for cachedFunction - when cache miss occurs, value is set
    const setItemSpans = findSpansByMethod('setItem');
    expect(setItemSpans.length).toBeGreaterThan(0);

    const cacheSetSpan = setItemSpans.find(
      span => typeof getCacheKey(span) === 'string' && (getCacheKey(span) as string).includes('user:123'),
    );
    expect(cacheSetSpan).toBeDefined();
    expect(cacheSetSpan?.attributes).toMatchObject({
      'sentry.op': { type: 'string', value: 'cache.put' },
      'sentry.origin': { type: 'string', value: 'auto.cache.nitro' },
      'db.operation.name': { type: 'string', value: 'setItem' },
    });

    // Spans for different cached functions
    const dataKeySpans = getItemSpans.filter(
      span => typeof getCacheKey(span) === 'string' && (getCacheKey(span) as string).includes('data:test-key'),
    );
    expect(dataKeySpans.length).toBeGreaterThan(0);

    // Spans for cachedHandler
    const cachedHandlerSpans = getItemSpans.filter(
      span => typeof getCacheKey(span) === 'string' && (getCacheKey(span) as string).includes('cachedHandler'),
    );
    expect(cachedHandlerSpans.length).toBeGreaterThan(0);

    // Verify all cache spans have OK status and are nested under the request's segment span
    allCacheSpans.forEach(span => {
      expect(span.status).toBe('ok');
      expect(span.is_segment).toBe(false);
      expect(span.parent_span_id).toBeDefined();
    });
  });

  test('correctly tracks cache hits and misses for cachedFunction', async ({ request }) => {
    const uniqueUser = `test-${Date.now()}`;
    const uniqueData = `data-${Date.now()}`;

    const cacheSpansPromise = collectCacheSpans();

    await request.get(`/api/test-cache?user=${uniqueUser}&data=${uniqueData}`);

    const allCacheSpans = await cacheSpansPromise;
    expect(allCacheSpans.length).toBeGreaterThan(0);

    const allGetItemSpans = allCacheSpans.filter(span => span.attributes['sentry.op']?.value === 'cache.get');
    const allSetItemSpans = allCacheSpans.filter(span => span.attributes['sentry.op']?.value === 'cache.put');

    expect(allGetItemSpans.length).toBeGreaterThan(0);
    expect(allSetItemSpans.length).toBeGreaterThan(0);

    const cacheMissSpans = allGetItemSpans.filter(
      span => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value === false,
    );
    const cacheHitSpans = allGetItemSpans.filter(span => span.attributes[SEMANTIC_ATTRIBUTE_CACHE_HIT]?.value === true);

    // At least one cache miss (first calls to getCachedUser and getCachedData)
    expect(cacheMissSpans.length).toBeGreaterThanOrEqual(1);

    // At least one cache hit (second calls to getCachedUser and getCachedData)
    expect(cacheHitSpans.length).toBeGreaterThanOrEqual(1);
  });
});
