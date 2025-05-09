import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';

sentryTest(
  'should remove the original callback if it was registered before Sentry initialized (w. original method)',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const capturedCalled = await page.evaluate(() => {
      // @ts-expect-error defined in subject.js
      return window.capturedCall;
    });

    expect(capturedCalled).toBe(false);
  },
);
