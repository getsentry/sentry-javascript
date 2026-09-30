import { expect, test } from '@playwright/test';

// `nitroServerTimingIntegration` is the second auto-injected integration (anchored on `unstorage`).
// It appends the trace-propagation data as a `Server-Timing` response header, so asserting on the
// header directly is enough — no span collection needed, and it works with tracing on or off.
test('auto-injects the Server-Timing trace-propagation header', async ({ request }) => {
  const res = await request.get('/api/test-transaction');
  expect(res.status()).toBe(200);

  const serverTiming = res.headers()['server-timing'] ?? '';
  expect(serverTiming).toContain('sentry-trace');
});
