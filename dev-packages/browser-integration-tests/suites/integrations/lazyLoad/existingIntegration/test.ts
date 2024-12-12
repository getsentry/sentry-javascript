import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

sentryTest('it bails if the integration is already loaded', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const hasIntegration = await page.evaluate('!!window.Sentry.getClient()?.getIntegrationByName("HttpClient")');
  expect(hasIntegration).toBe(false);

  const scriptTagsBefore = await page.evaluate('document.querySelectorAll("script").length');

  await page.evaluate('window._testLazyLoadIntegration()');
  await page.waitForFunction('window._integrationLoaded');

  const scriptTagsAfter = await page.evaluate('document.querySelectorAll("script").length');

  const hasIntegration2 = await page.evaluate('!!window.Sentry.getClient()?.getIntegrationByName("HttpClient")');
  expect(hasIntegration2).toBe(true);

  expect(scriptTagsAfter).toBe(scriptTagsBefore);
});
