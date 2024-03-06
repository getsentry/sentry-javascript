import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';

sentryTest(
  'exports a shim replayIntegration integration for non-replay bundles',
  async ({ getLocalTestPath, page, forceFlushReplay }) => {
    const bundle = process.env.PW_BUNDLE;

    if (!bundle || !bundle.startsWith('bundle_') || bundle.includes('replay')) {
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
    await forceFlushReplay();

    expect(requestCount).toBe(0);
    expect(consoleMessages).toEqual([
      'You are using replayIntegration() even though this bundle does not include replay.',
    ]);
  },
);
