import { expect, test } from '@playwright/test';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

test('answers the managed tunnel when the SDK is set up with `sentryCloudflareNitroPlugin`', async ({ request }) => {
  const dsn = 'http://public@localhost:3031/1337';
  // The path the SDK derives from `dsn`.
  const response = await request.post('/qpo967', {
    data: `${JSON.stringify({ dsn, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'client_report' })}\n${JSON.stringify({ timestamp: Date.now() / 1000, discarded_events: [] })}\n`,
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });

  expect(response.headers()['x-sentry-tunnel']).toBe('1');
  expect(response.status()).toBe(200);
});
