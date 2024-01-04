import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

sentryTest(
  'should not add default integrations if integrations function is provided',
  async ({ getLocalTestUrl, page }) => {
    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await page.waitForFunction(() => {
      return (window as any).__sentryLoaded;
    });

    const hasCustomIntegration = await page.evaluate(() => {
      return !!(window as any).Sentry.getCurrentHub().getClient().getIntegrationById('CustomIntegration');
    });

    const hasReplay = await page.evaluate(() => {
      return !!(window as any).Sentry.getCurrentHub().getClient().getIntegrationById('Replay');
    });
    const hasBrowserTracing = await page.evaluate(() => {
      return !!(window as any).Sentry.getCurrentHub().getClient().getIntegrationById('BrowserTracing');
    });

    expect(hasCustomIntegration).toEqual(true);
    expect(hasReplay).toEqual(false);
    expect(hasBrowserTracing).toEqual(false);
  },
);
