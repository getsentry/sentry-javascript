import { expect, test } from '@playwright/test';
import { isServerSpanAt, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.PUBLIC_E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const TUNNEL_PATH = /^\/[a-z0-9]{1,7}$/;

// Several page loads hit the same isolate, so later ones run with the client the first one cached.
test('answers the managed tunnel on every request to the isolate, without tunnel spans', async ({ page }) => {
  const raceTunnelSpan = watchForTunnelSpan('astro-5-cf-pages', isServerSpanAt(TUNNEL_PATH));

  for (let i = 0; i < 3; i++) {
    const tunnelResponsePromise = page.waitForResponse(
      response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
    );

    await page.goto('/');

    expect((await tunnelResponsePromise).status()).toBe(200);
  }

  expect(
    await raceTunnelSpan(isServerSpanAt('/api/request-error'), () => page.request.get('/api/request-error?request=0')),
  ).toBe('anchor');
});
