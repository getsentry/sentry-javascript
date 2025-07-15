import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

/**
 * By setting `unregisterOriginalCallbacks` to `true`, we can avoid the issue of double-invocations
 * (see other test for more details).
 */
sentryTest(
  'causes listeners to be invoked twice if registered before and after Sentry initialization',
  async ({ getLocalTestUrl, page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    await page.goto(await getLocalTestUrl({ testDir: __dirname }));

    await page.waitForFunction('window.Sentry');

    await page.locator('#btn').click();

    expect(consoleLogs).toHaveLength(1);
    expect(consoleLogs).toEqual(['clicked']);
  },
);
