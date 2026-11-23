import { expect, test } from '@playwright/test';
import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

// The Pages variant serves the app at the root, the others under a base path with trailing slashes.
const pages = !!process.env.E2E_TEST_CF_PAGES;
const basePath = pages ? '' : '/docs';
const trailingSlash = !pages;

// First, while the server has only served a prerendered page, so no SSR page has run `Sentry.init` yet.
test('answers the managed tunnel when the first page is prerendered', async ({ page }) => {
  // With `@sentry/astro`, an Astro 5 Cloudflare build fails to prerender, so the Pages variant has no prerendered page.
  test.skip(pages);

  const tunnelPath = `${basePath}/qpo967${trailingSlash ? '/' : ''}`;
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && new URL(response.url()).pathname === tunnelPath,
  );

  await page.goto(`${basePath}/static${trailingSlash ? '/' : ''}`);

  expect((await tunnelResponsePromise).status()).toBe(200);
});

runManagedTunnelSuite({ appName: 'astro-7-tunnel', basePath, trailingSlash });
