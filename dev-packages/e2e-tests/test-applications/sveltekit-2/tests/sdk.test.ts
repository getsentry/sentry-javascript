import { expect, test } from '@playwright/test';
import { waitForInitialPageload } from './utils';

test.describe('SDK-internal behavior', () => {
  test("Doesn't inject fetch proxy script for SvelteKit>=2.16.0", async ({ page }) => {
    await waitForInitialPageload(page, { route: '/client-error' });
    // @ts-expect-error - this is the variable the fetch proxy script sets if it would be injected
    const proxyHandle = await page.waitForFunction(() => globalThis._sentryFetchProxy);
    expect(proxyHandle).toBeUndefined();
  });
});
