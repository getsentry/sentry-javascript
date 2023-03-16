import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';

sentryTest('exports a shim BrowserTracing integration for non-tracing bundles', async ({ getLocalTestPath, page }) => {
  const bundle = process.env.PW_BUNDLE;

  if (!bundle || !bundle.startsWith('bundle_') || bundle.includes('tracing')) {
    sentryTest.skip();
  }

  const consoleMessages: string[] = [];
  page.on('console', msg => consoleMessages.push(msg.text()));

  let requestCount = 0;
  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    requestCount++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  expect(requestCount).toBe(0);
  expect(consoleMessages).toEqual([
    'You are using new BrowserTracing() even though this bundle does not include tracing.',
  ]);
});
