import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const useTunnelRoute = process.env.E2E_TEST_USE_TUNNEL_ROUTE === '1';

test.skip(!useTunnelRoute, 'Tunnel assertions only run in the tunnel variant');

test('Sends client-side errors through the monitor tunnel route', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Client Test Error';
  });

  await page.goto('/');

  await expect(page.locator('button').filter({ hasText: 'Break the client' })).toBeVisible();

  const monitorResponsePromise = page.waitForResponse(response => {
    return response.url().endsWith('/monitor') && response.request().method() === 'POST';
  });

  await page.locator('button').filter({ hasText: 'Break the client' }).click();

  const monitorResponse = await monitorResponsePromise;
  const errorEvent = await errorEventPromise;

  expect(monitorResponse.status()).toBe(200);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Sentry Client Test Error');
  expect(errorEvent.transaction).toBe('/');
});
