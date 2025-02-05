import { expect, test } from '@playwright/test';

test.describe('SDK-internal behavior', () => {
  // TODO remove before merging
  for (let i = 0; i < 100; i++) {
    test(`Injects fetch proxy script for SvelteKit<2.16.0 ${i}`, async ({ page }) => {
      await page.goto('/');

      // @ts-expect-error this is defined
      await page.waitForFunction(() => typeof window.__SENTRY__ === 'object');
      const proxyHandle = await page.evaluate('typeof window._sentryFetchProxy');

      // fetch proxy script ran
      expect(proxyHandle).toBe('function');
    });
  }
});
