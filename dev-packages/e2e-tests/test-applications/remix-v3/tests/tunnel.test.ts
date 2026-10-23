import { expect, test } from '@playwright/test';
import { isServerSpanAt, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const TUNNEL_PATH = /^\/[a-z0-9]{1,7}$/;

test('answers the managed tunnel before the app handler, route matching and the app middleware', async ({ page }) => {
  // The variant's handler rejects every other POST before its router, except with the plain server, where nothing ahead
  // of the router could answer the tunnel. Its auth middleware rejects the POSTs that get through.
  if (!process.env.E2E_TEST_PLAIN_SERVER) {
    expect((await page.request.post('/anything', { data: 'x' })).status()).toBe(403);
  }
  expect((await page.request.post('/anything', { data: 'x', headers: { 'x-app-auth': 'ok' } })).status()).toBe(401);

  const raceTunnelSpan = watchForTunnelSpan('remix-v3', isServerSpanAt(TUNNEL_PATH));
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/');

  expect((await tunnelResponsePromise).status()).toBe(200);
  expect(await raceTunnelSpan(isServerSpanAt('/api/items/1'), () => page.request.get('/api/items/1'))).toBe('anchor');
});
