import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { shouldSkipReplayTest } from '../../../../utils/replayHelpers';

sentryTest('should handle custom added integrations & default integrations', async ({ getLocalTestUrl, page }) => {
  const shouldHaveReplay = !shouldSkipReplayTest();
  const shouldHaveBrowserTracing = !shouldSkipTracingTest();

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
  expect(hasReplay).toEqual(shouldHaveReplay);
  expect(hasBrowserTracing).toEqual(shouldHaveBrowserTracing);
});
