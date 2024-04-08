import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

sentryTest('parses a string sample rate', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  await page.waitForFunction('window._testDone');
  await page.evaluate('window.Sentry.getClient().flush()');

  const count = await page.evaluate('window._errorCount');

  expect(count).toStrictEqual(0);
});
