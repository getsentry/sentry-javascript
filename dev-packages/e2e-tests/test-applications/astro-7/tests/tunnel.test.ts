import { expect, test } from '@playwright/test';
import { isServerSpanAt, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.PUBLIC_E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const TUNNEL_PATH = /^\/docs\/[a-z0-9]{1,7}\/$/;

// First in the file, while the server has only served prerendered pages, so no SSR page has run `Sentry.init` yet.
test('answers the managed tunnel when the first page is prerendered', async ({ page }) => {
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/docs/test-static/');

  expect((await tunnelResponsePromise).status()).toBe(200);
});

test('answers the managed tunnel under the base path before the app middleware', async ({ page }) => {
  // The variant's auth middleware rejects every other POST.
  expect((await page.request.post('/docs/anything/', { data: 'x' })).status()).toBe(401);

  const raceTunnelSpan = watchForTunnelSpan('astro-7', isServerSpanAt(/\/docs\/[a-z0-9]{1,7}\/?$/));
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/docs/');

  expect((await tunnelResponsePromise).status()).toBe(200);
  expect(await raceTunnelSpan(isServerSpanAt(/^\/docs\/test-ssr/), () => page.request.get('/docs/test-ssr/'))).toBe(
    'anchor',
  );
});
