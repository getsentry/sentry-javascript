import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipMetricsTest } from '../../../utils/helpers';

sentryTest('exports shim metrics integration for non-tracing bundles', async ({ getLocalTestPath, page }) => {
  // Skip in tracing tests
  if (!shouldSkipMetricsTest()) {
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

  const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });

  await page.goto(url);

  expect(requestCount).toBe(0);
  expect(consoleMessages).toEqual([
    'You are using metrics even though this bundle does not include tracing.',
    'You are using metrics even though this bundle does not include tracing.',
    'You are using metrics even though this bundle does not include tracing.',
    'You are using metrics even though this bundle does not include tracing.',
  ]);
});
