import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const TUNNEL_PATH = /^\/app\/[a-z0-9]{1,7}$/;

test('serves the managed tunnel from the Worker under the base path', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan(
    'sveltekit-3-cloudflare-workers',
    span => getSpanOp(span) === 'pageload' && span.is_segment,
  );
  const tunnelServerSpanPromise = waitForStreamedSpan(
    'sveltekit-3-cloudflare-workers',
    span => getSpanOp(span) === 'http.server' && TUNNEL_PATH.test(String(span.attributes['url.path']?.value ?? '')),
  );
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/app/');
  const tunnelResponse = await tunnelResponsePromise;

  expect(tunnelResponse.status()).toBe(200);
  expect(new URL(tunnelResponse.url()).origin).toBe(new URL(page.url()).origin);
  await expect(pageloadSpanPromise).resolves.toBeDefined();

  // Anchor on a regular server span requested after the tunnel traffic: spans flush in order, so a tunnel span
  // would arrive first.
  const anchorSpanPromise = waitForStreamedSpan(
    'sveltekit-3-cloudflare-workers',
    span =>
      getSpanOp(span) === 'http.server' &&
      String(span.attributes['url.path']?.value ?? '').startsWith('/app/server-load-error'),
  );
  await page.request.get('/app/server-load-error');

  const winner = await Promise.race([
    tunnelServerSpanPromise.then(() => 'tunnel' as const),
    anchorSpanPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});
