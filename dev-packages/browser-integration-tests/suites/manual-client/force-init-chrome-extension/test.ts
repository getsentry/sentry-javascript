import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';

sentryTest(
  'initializes inside a Chrome browser extension if `skipBrowserExtensionCheck` is set',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const isInitialized = await page.evaluate(() => {
      return !!(window as any).Sentry.isInitialized();
    });

    expect(isInitialized).toBe(true);
  },
);
