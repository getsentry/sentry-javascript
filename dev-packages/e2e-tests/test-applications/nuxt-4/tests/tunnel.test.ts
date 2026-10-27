import { expect, test } from '@playwright/test';
import {
  isServerSpanAt,
  makeClientReportEnvelope,
  waitForError,
  watchForTunnelSpan,
} from '@sentry-internal/test-utils';

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

  const raceTunnelSpan = watchForTunnelSpan('nuxt-4', isServerSpanAt(TUNNEL_PATH));
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

test('answers the managed tunnel once, without errors from route rules that run after it', async ({ request }) => {
  const dsn = 'http://public@localhost:3031/1337';
  // The path the SDK derives from `dsn`.
  const tunnelPath = '/qpo967';
  const tunnelErrorPromise = waitForError(
    'nuxt-4',
    event => !!event.exception?.values?.[0]?.value?.includes('Cannot set headers'),
  );
  const anchorErrorPromise = waitForError(
    'nuxt-4',
    event => event.exception?.values?.[0]?.value === 'Nuxt 4 Server error',
  );

  const response = await request.post(`${BASE_PATH}${tunnelPath}`, {
    data: makeClientReportEnvelope(dsn),
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });
  expect(response.status()).toBe(200);

  // Errors are sent in order, so one from the tunnel request would arrive before this later one.
  await request.get(`${BASE_PATH}/api/server-error`);

  const winner = await Promise.race([
    tunnelErrorPromise.then(() => 'tunnel' as const),
    anchorErrorPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});
