import { expect, test } from '@playwright/test';
import { isServerSpanAt, makeClientReportEnvelope, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

// The isolate's first tunnel request is the one a late span filter would let through, so this stays the only test.
test('answers the managed tunnel set up by `sentryCloudflareNitroPlugin`, without a span of it', async ({
  request,
}) => {
  const dsn = 'http://public@localhost:3031/1337';
  const raceTunnelSpan = watchForTunnelSpan('nuxt-4-cloudflare', isServerSpanAt(/^\/app\/qpo967/));

  // The path the SDK derives from `dsn`.
  const response = await request.post('/app/qpo967', {
    data: makeClientReportEnvelope(dsn),
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });

  expect(response.status()).toBe(200);
  expect(await raceTunnelSpan(isServerSpanAt('/app/api/anchor'), () => request.get('/app/api/anchor'))).toBe('anchor');
});
