import { expect, test } from '@playwright/test';
import { isServerSpanAt, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const APP_NAME = 'solidstart';
const BASE_PATH = process.env.E2E_TEST_BASE_PATH ?? '';
const TUNNEL_PATH = new RegExp(`^${BASE_PATH}/[a-z0-9]{1,7}$`);

test('answers the managed tunnel before the app middleware', async ({ page }) => {
  // The variant's auth middleware rejects every other POST.
  expect((await page.request.post(`${BASE_PATH}/`, { data: 'x' })).status()).toBe(401);

  const raceTunnelSpan = watchForTunnelSpan(APP_NAME, isServerSpanAt(TUNNEL_PATH));
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto(`${BASE_PATH}/`);

  expect((await tunnelResponsePromise).status()).toBe(200);
  expect(
    await raceTunnelSpan(isServerSpanAt(`${BASE_PATH}/users/6`), () => page.request.get(`${BASE_PATH}/users/6`)),
  ).toBe('anchor');
});
