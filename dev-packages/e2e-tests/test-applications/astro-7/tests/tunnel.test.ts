import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.PUBLIC_E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const TUNNEL_PATH = /^\/docs\/[a-z0-9]{1,7}\/$/;

test('answers the managed tunnel under the base path before the app middleware', async ({ page }) => {
  // The variant's auth middleware rejects every other POST.
  expect((await page.request.post('/docs/anything/', { data: 'x' })).status()).toBe(401);

  const tunnelServerSpanPromise = waitForStreamedSpan(
    'astro-7',
    span =>
      getSpanOp(span) === 'http.server' &&
      /\/docs\/[a-z0-9]{1,7}\/?$/.test(String(span.attributes['url.path']?.value ?? '')),
  );
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/docs/');
  const tunnelResponse = await tunnelResponsePromise;

  expect(tunnelResponse.status()).toBe(200);
  expect(new URL(tunnelResponse.url()).origin).toBe(new URL(page.url()).origin);

  // Anchor on a regular server span requested after the tunnel traffic: spans flush in order, so a tunnel span
  // would arrive first.
  const anchorSpanPromise = waitForStreamedSpan(
    'astro-7',
    span =>
      getSpanOp(span) === 'http.server' &&
      String(span.attributes['url.path']?.value ?? '').startsWith('/docs/test-ssr'),
  );
  await page.request.get('/docs/test-ssr/');

  const winner = await Promise.race([
    tunnelServerSpanPromise.then(() => 'tunnel' as const),
    anchorSpanPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});
