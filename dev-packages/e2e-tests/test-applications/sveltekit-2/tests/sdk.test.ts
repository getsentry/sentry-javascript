import { expect, test } from '@playwright/test';
import { waitForInitialPageload } from './utils';

test.describe('SDK-internal behavior', () => {
  test("Doesn't inject fetch proxy script for SvelteKit>=2.16.0", async ({ page }) => {
    await waitForInitialPageload(page, { route: '/' });
    const sentryCarrier = await page.evaluate('typeof window.__SENTRY__');
    const proxyHandle = await page.evaluate('typeof window._sentryFetchProxy');

    // sanity check
    expect(sentryCarrier).toBe('object');

    // fetch proxy script didn't run
    expect(proxyHandle).toBe('undefined');
  });
});
