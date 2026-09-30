import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

// The point of this test: on Cloudflare, `nitroIntegration` is not imported by the app — it is
// auto-injected by the orchestrion transform over `h3`/`unstorage` and instantiated from the global
// marker at `init()`. So seeing `auto.http.nitro.*` spans proves that path works end to end.
function collectRequestSpans() {
  return collectStreamedSpans(
    'cloudflare-nitro',
    spans =>
      spans.some(span => span.is_segment && span.attributes['url.path']?.value === '/api/test-transaction') &&
      spans.some(span => String(span.attributes['sentry.origin']?.value ?? '').startsWith('auto.http.nitro')),
  );
}

test('auto-injects nitro instrumentation and emits http.server + nitro spans', async ({ request }) => {
  const spansPromise = collectRequestSpans();

  const res = await request.get('/api/test-transaction');
  expect(res.status()).toBe(200);

  const spans = await spansPromise;

  const segmentSpan = spans.find(
    span => span.is_segment && span.attributes['url.path']?.value === '/api/test-transaction',
  );
  expect(segmentSpan).toBeDefined();
  expect(getSpanOp(segmentSpan!)).toBe('http.server');

  const nitroSpans = spans.filter(
    span =>
      span.trace_id === segmentSpan!.trace_id &&
      String(span.attributes['sentry.origin']?.value ?? '').startsWith('auto.http.nitro'),
  );
  expect(nitroSpans.length).toBeGreaterThanOrEqual(1);
});
