import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

sentryTest(
  'should not add default integrations if integrations function is provided',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await page.waitForFunction(() => {
      return (window as any).__sentryLoaded;
    });

    const hasCustomIntegration = await page.evaluate(() => {
      return !!(window as any).Sentry.getClient().getIntegrationByName('CustomIntegration');
    });

    const hasReplay = await page.evaluate(() => {
      return !!(window as any).Sentry.getClient().getIntegrationByName('Replay');
    });
    const hasBrowserTracing = await page.evaluate(() => {
      return !!(window as any).Sentry.getClient().getIntegrationByName('BrowserTracing');
    });

    expect(hasCustomIntegration).toEqual(true);
    expect(hasReplay).toEqual(false);
    expect(hasBrowserTracing).toEqual(false);
  },
);
