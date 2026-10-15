import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const APP_NAME = 'solidstart';
const TUNNEL_PATH = /^\/[a-z0-9]{1,7}$/;

test('answers the managed tunnel before the app middleware', async ({ page }) => {
  // The variant's auth middleware rejects every other POST.
  expect((await page.request.post('/', { data: 'x' })).status()).toBe(401);

  const tunnelServerSpanPromise = waitForStreamedSpan(
    APP_NAME,
    span => getSpanOp(span) === 'http.server' && TUNNEL_PATH.test(String(span.attributes['url.path']?.value ?? '')),
  );
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/');
  const tunnelResponse = await tunnelResponsePromise;

  expect(tunnelResponse.status()).toBe(200);
  expect(new URL(tunnelResponse.url()).origin).toBe(new URL(page.url()).origin);

  // Anchor on a regular server span requested after the tunnel traffic: spans flush in order, so a tunnel span
  // would arrive first.
  const anchorSpanPromise = waitForStreamedSpan(
    APP_NAME,
    span => getSpanOp(span) === 'http.server' && String(span.attributes['url.path']?.value ?? '') === '/users/6',
  );
  await page.request.get('/users/6');

  const winner = await Promise.race([
    tunnelServerSpanPromise.then(() => 'tunnel' as const),
    anchorSpanPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});
