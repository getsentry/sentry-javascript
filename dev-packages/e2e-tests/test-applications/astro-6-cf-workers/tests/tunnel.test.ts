import { expect, test } from '@playwright/test';
import { getSpanOp, watchForTunnelSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.PUBLIC_E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const APP_NAME = 'astro-6-cf-workers';
const TUNNEL_PATH = /^\/docs\/[a-z0-9]{1,7}\/$/;

test('answers the managed tunnel under the base path, without tunnel spans', async ({ page }) => {
  const raceTunnelSpan = watchForTunnelSpan(
    APP_NAME,
    span =>
      getSpanOp(span) === 'http.server' &&
      /\/docs\/[a-z0-9]{1,7}\/?$/.test(
        String(span.attributes['url.path']?.value ?? span.attributes['url.full']?.value ?? span.name),
      ),
  );
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/docs/');
  const tunnelResponse = await tunnelResponsePromise;

  expect(tunnelResponse.status()).toBe(200);
  expect(
    await raceTunnelSpan(
      span => getSpanOp(span) === 'http.server' && span.is_segment && span.name.includes('test-ssr'),
      () => page.request.get('/docs/test-ssr/'),
    ),
  ).toBe('anchor');
});
