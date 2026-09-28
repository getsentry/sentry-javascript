import { expect, test } from '@playwright/test';
import { waitForInitialPageload } from './utils';

test.describe('SDK-internal behavior', () => {
  test("Doesn't inject fetch proxy script for SvelteKit>=2.16.0", async ({ page }) => {
    await waitForInitialPageload(page, { route: '/' });

    // @ts-expect-error this is defined
    await page.waitForFunction(() => typeof window.__SENTRY__ === 'object');

    const proxyHandle = await page.evaluate('typeof window._sentryFetchProxy');

    // fetch proxy script didn't run
    expect(proxyHandle).toBe('undefined');
  });

  test("Doesn't add trace meta tags to prerendered pages", async ({ baseURL }) => {
    const prerenderedHtml = await (await fetch(`${baseURL}/prerendered`)).text();
    const ssrHtml = await (await fetch(`${baseURL}/`)).text();

    expect(prerenderedHtml).toContain('Prerendered page');
    expect(prerenderedHtml).not.toContain('<meta name="sentry-trace"');
    expect(prerenderedHtml).not.toContain('<meta name="baggage"');

    // SSR pages still get the meta tags
    expect(ssrHtml).toContain('<meta name="sentry-trace"');
    expect(ssrHtml).toContain('<meta name="baggage"');
  });
});
