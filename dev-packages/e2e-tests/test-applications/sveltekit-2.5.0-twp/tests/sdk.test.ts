import { expect, test } from '@playwright/test';

test.describe('SDK-internal behavior', () => {
  test('Injects fetch proxy script for SvelteKit<2.16.0', async ({ page }) => {
    await page.goto('/');

    // @ts-expect-error this is defined
    await page.waitForFunction(() => typeof window.__SENTRY__ === 'object');
    const proxyHandle = await page.evaluate('typeof window._sentryFetchProxy');

    // fetch proxy script ran
    expect(proxyHandle).toBe('function');
  });
});
