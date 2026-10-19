import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

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

  const tunnelServerSpanPromise = waitForStreamedSpan(
    'nuxt-5',
    span => getSpanOp(span) === 'http.server' && TUNNEL_PATH.test(String(span.attributes['url.path']?.value ?? '')),
  );
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto(`${BASE_PATH}/`);
  const tunnelResponse = await tunnelResponsePromise;

  expect(tunnelResponse.status()).toBe(200);
  expect(new URL(tunnelResponse.url()).origin).toBe(new URL(page.url()).origin);

  // Anchor on a regular server span requested after the tunnel traffic: spans flush in order, so a tunnel span
  // would arrive first.
  const anchorSpanPromise = waitForStreamedSpan(
    'nuxt-5',
    span =>
      getSpanOp(span) === 'http.server' &&
      String(span.attributes['url.path']?.value ?? '') === `${BASE_PATH}/api/test-param/123`,
  );
  await page.request.get(`${BASE_PATH}/api/test-param/123`);

  const winner = await Promise.race([
    tunnelServerSpanPromise.then(() => 'tunnel' as const),
    anchorSpanPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});
