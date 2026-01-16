import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest('exports a shim consoleLoggingIntegration for non-logs bundles', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE;

  // Only run this for CDN bundles that do NOT include logs
  // Skip minified bundles because DEBUG_BUILD is false and warnings won't appear
  if (!bundle?.startsWith('bundle') || bundle.includes('logs') || bundle.includes('min')) {
    sentryTest.skip();
  }

  const consoleMessages: string[] = [];
  page.on('console', msg => consoleMessages.push(msg.text()));

  let requestCount = 0;
  await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, route => {
    requestCount++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });

  await page.goto(url);

  // Wait a bit to ensure no requests are made
  await page.waitForTimeout(500);

  expect(requestCount).toBe(0);
  expect(consoleMessages).toEqual([
    'You are using consoleLoggingIntegration() even though this bundle does not include logs.',
  ]);
});
