import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const TUNNEL_PATH = /^\/app\/[a-z0-9]{1,7}$/;

test('sends client events through the managed tunnel under the base path', async ({ page }) => {
  const errorEventPromise = waitForError(
    'sveltekit-3',
    event => event?.exception?.values?.[0]?.value === 'Click Error',
  );
  const tunnelServerSpanPromise = waitForStreamedSpan(
    'sveltekit-3',
    span => getSpanOp(span) === 'http.server' && TUNNEL_PATH.test(String(span.attributes['url.path']?.value ?? '')),
  );

  // The pageload envelope is the first tunnel request, and it's only sent once the app hydrated.
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );
  await page.goto('/app/client-error');
  const tunnelResponse = await tunnelResponsePromise;

  expect(tunnelResponse.status()).toBe(200);
  expect(new URL(tunnelResponse.url()).origin).toBe(new URL(page.url()).origin);

  await page.getByText('Throw error').click();
  await expect(errorEventPromise).resolves.toBeDefined();

  // Anchor on a regular server span requested after the tunnel traffic: spans flush in order, so a tunnel span
  // would arrive first.
  const anchorSpanPromise = waitForStreamedSpan(
    'sveltekit-3',
    span =>
      getSpanOp(span) === 'http.server' && String(span.attributes['url.path']?.value ?? '').startsWith('/app/users'),
  );
  await page.request.get('/app/users/123');

  const winner = await Promise.race([
    tunnelServerSpanPromise.then(() => 'tunnel' as const),
    anchorSpanPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});

test('does not send spans of tunnel requests with Kit tracing on', async ({ page }) => {
  // Kit's own `sveltekit.handle.root` span starts with only `http.url`, no `url.path`.
  const tunnelSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    const url = span.attributes['http.url']?.value ?? span.attributes['url.path']?.value;
    return typeof url === 'string' && TUNNEL_PATH.test(url.startsWith('http') ? new URL(url).pathname : url);
  });
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto('/app/');
  await tunnelResponsePromise;

  // Anchor on a regular page span requested after the tunnel traffic: spans flush in order, so a tunnel span
  // would arrive first.
  const anchorSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    const url = span.attributes['http.url']?.value ?? span.attributes['url.path']?.value;
    return typeof url === 'string' && url.endsWith('/app/users/456');
  });
  await page.request.get('/app/users/456');

  const winner = await Promise.race([
    tunnelSpanPromise.then(() => 'tunnel' as const),
    anchorSpanPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});
