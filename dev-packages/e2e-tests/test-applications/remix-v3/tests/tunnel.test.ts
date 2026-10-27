import { expect, test } from '@playwright/test';
import { isServerSpanAt, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const TUNNEL_PATH = /^\/[a-z0-9]{1,7}$/;

test('the app handler rejects other POSTs before the router', async ({ page }) => {
  // The plain server has nothing ahead of the router that could answer the tunnel.
  test.skip(!!process.env.E2E_TEST_PLAIN_SERVER, 'Only the request listener variant has a handler ahead of the router');

  expect((await page.request.post('/anything', { data: 'x' })).status()).toBe(403);
});

test('answers the managed tunnel before the app handler, route matching and the app middleware', async ({ page }) => {
  // The app's auth middleware rejects the POSTs that get past its handler.
  expect((await page.request.post('/anything', { data: 'x', headers: { 'x-app-auth': 'ok' } })).status()).toBe(401);

  const raceTunnelSpan = watchForTunnelSpan('remix-v3', isServerSpanAt(TUNNEL_PATH));
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/');

  expect((await tunnelResponsePromise).status()).toBe(200);
  expect(await raceTunnelSpan(isServerSpanAt('/api/items/1'), () => page.request.get('/api/items/1'))).toBe('anchor');
});
