import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

// Nitro's `defineCachedFunction` goes through unstorage, whose tracing channels `nitroIntegration`
// subscribes to — so cache spans on Cloudflare are further proof the auto-injected integration is
// active (its storage subscriber, not just the HTTP one).
function collectCacheSpans() {
  return collectStreamedSpans(
    'cloudflare-nitro',
    spans =>
      spans.some(span => span.is_segment && span.attributes['url.path']?.value === '/api/test-cache') &&
      spans.some(span => String(span.attributes['sentry.origin']?.value ?? '') === 'auto.cache.nitro'),
  );
}

test('emits cache spans from the auto-injected storage instrumentation', async ({ request }) => {
  const spansPromise = collectCacheSpans();

  const res = await request.get('/api/test-cache');
  expect(res.status()).toBe(200);

  const spans = await spansPromise;

  const cacheSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.cache.nitro');
  expect(cacheSpans.length).toBeGreaterThanOrEqual(1);
  expect(getSpanOp(cacheSpans[0]!)).toMatch(/^cache\./);
});
