import { expect, test } from '@playwright/test';
import { getSpanOp, isServerSpanAt, waitForStreamedSpan, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const APP_NAME = 'sveltekit-3-cloudflare-workers';
const TUNNEL_PATH = /^\/app\/[a-z0-9]{1,7}$/;

test('serves the managed tunnel from the Worker under the base path', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => getSpanOp(span) === 'pageload' && span.is_segment);
  const raceTunnelSpan = watchForTunnelSpan(APP_NAME, isServerSpanAt(TUNNEL_PATH));
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/app/');

  expect((await tunnelResponsePromise).status()).toBe(200);
  await expect(pageloadSpanPromise).resolves.toBeDefined();
  expect(
    await raceTunnelSpan(isServerSpanAt('/app/server-load-error'), () => page.request.get('/app/server-load-error')),
  ).toBe('anchor');
});
