import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const tunnelRouteMode =
  process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? (process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1' ? 'custom' : 'off');
const expectedTunnelPathMatcher =
  tunnelRouteMode === 'static'
    ? '/monitor'
    : tunnelRouteMode === 'custom'
      ? '/custom-monitor'
      : tunnelRouteMode === 'object'
        ? '/object-monitor'
        : /^\/[a-z0-9]{8}$/;

test.skip(tunnelRouteMode === 'off', 'Tunnel assertions only run in the tunnel-route variants');

test('Sends client-side errors through the configured tunnel route', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Client Test Error';
  });

  await page.goto('/');
  const pageOrigin = new URL(page.url()).origin;

  // Wait for React to hydrate (see __root.tsx) before clicking — the SSR HTML
  // renders the button before the onClick handler is attached, and clicking
  // pre-hydration would fire no handler and produce no error.
  await page.locator('html[data-hydrated="true"]').waitFor();

  await expect(page.locator('button').filter({ hasText: 'Break the client' })).toBeVisible();

  const managedTunnelResponsePromise = page.waitForResponse(response => {
    const responseUrl = new URL(response.url());

    return (
      responseUrl.origin === pageOrigin &&
      response.request().method() === 'POST' &&
      (typeof expectedTunnelPathMatcher === 'string'
        ? responseUrl.pathname === expectedTunnelPathMatcher
        : expectedTunnelPathMatcher.test(responseUrl.pathname))
    );
  });

  await page.locator('button').filter({ hasText: 'Break the client' }).click();

  const managedTunnelResponse = await managedTunnelResponsePromise;
  const managedTunnelUrl = new URL(managedTunnelResponse.url());
  const errorEvent = await errorEventPromise;

  expect(managedTunnelResponse.status()).toBe(200);
  expect(managedTunnelUrl.origin).toBe(pageOrigin);

  if (typeof expectedTunnelPathMatcher === 'string') {
    expect(managedTunnelUrl.pathname).toBe(expectedTunnelPathMatcher);
  } else {
    expect(managedTunnelUrl.pathname).toMatch(expectedTunnelPathMatcher);
    expect(managedTunnelUrl.pathname).not.toBe('/monitor');
  }

  expect(errorEvent.exception?.values?.[0]?.value).toBe('Sentry Client Test Error');
  expect(errorEvent.transaction).toBe('/');
});
