import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

// First in this file: the isolate's first tunnel request is the one a late span filter would let through.
test('drops the server span of a tunnel request under the base URL', async ({ request }) => {
  const dsn = 'http://public@localhost:3031/1337';
  const tunnelSpanPromise = waitForStreamedSpan(
    'nuxt-4-cloudflare',
    span =>
      getSpanOp(span) === 'http.server' && String(span.attributes['url.path']?.value ?? '').startsWith('/app/qpo967'),
  );
  const anchorSpanPromise = waitForStreamedSpan(
    'nuxt-4-cloudflare',
    span => getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/app/api/anchor',
  );

  await request.post('/app/qpo967', {
    data: `${JSON.stringify({ dsn, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'client_report' })}\n${JSON.stringify({ timestamp: Date.now() / 1000, discarded_events: [] })}\n`,
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });
  // Spans flush in order, so a tunnel span would arrive before this one.
  await request.get('/app/api/anchor');

  const winner = await Promise.race([
    tunnelSpanPromise.then(() => 'tunnel' as const),
    anchorSpanPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});

test('answers the managed tunnel when the SDK is set up with `sentryCloudflareNitroPlugin`', async ({ request }) => {
  const dsn = 'http://public@localhost:3031/1337';
  // The path the SDK derives from `dsn`.
  const response = await request.post('/app/qpo967', {
    data: `${JSON.stringify({ dsn, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'client_report' })}\n${JSON.stringify({ timestamp: Date.now() / 1000, discarded_events: [] })}\n`,
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });

  expect(response.headers()['x-sentry-tunnel']).toBe('1');
  expect(response.status()).toBe(200);
});
