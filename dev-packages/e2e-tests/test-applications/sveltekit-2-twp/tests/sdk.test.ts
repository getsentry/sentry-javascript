import { expect, test } from '@playwright/test';

test.describe('SDK-internal behavior', () => {
  test('Injects fetch proxy script for SvelteKit<2.16.0', async ({ page }) => {
    await page.goto('/');

    const sentryCarrier = await page.evaluate('typeof window.__SENTRY__');
    const proxyHandle = await page.evaluate('typeof window._sentryFetchProxy');

    // sanity check
    expect(sentryCarrier).toBe('object');

    // fetch proxy script ran
    expect(proxyHandle).toBe('function');
  });
});
