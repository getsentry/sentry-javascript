import { expect, test } from '@playwright/test';
import { isServerSpanAt, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

test.beforeAll(async ({ request }) => {
  // `nuxt dev` opens the port before it's ready and answers 503 until then, and Playwright only waits for the port.
  await expect
    .poll(async () => (await request.get(`${process.env.E2E_TEST_BASE_PATH ?? ''}/`)).status(), { timeout: 30_000 })
    .not.toBe(503);
});

const BASE_PATH = process.env.E2E_TEST_BASE_PATH ?? '';
const TUNNEL_PATH = new RegExp(`^${BASE_PATH}/[a-z0-9]{1,7}$`);

test('answers the managed tunnel before the app auth middleware', async ({ page }) => {
  // The variant's auth middleware rejects every other POST.
  expect((await page.request.post(`${BASE_PATH}/api/anything`, { data: 'x' })).status()).toBe(401);

  const raceTunnelSpan = watchForTunnelSpan('nuxt-5', isServerSpanAt(TUNNEL_PATH));
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto(`${BASE_PATH}/`);

  expect((await tunnelResponsePromise).status()).toBe(200);
  expect(
    await raceTunnelSpan(isServerSpanAt(`${BASE_PATH}/api/test-param/123`), () =>
      page.request.get(`${BASE_PATH}/api/test-param/123`),
    ),
  ).toBe('anchor');
});
