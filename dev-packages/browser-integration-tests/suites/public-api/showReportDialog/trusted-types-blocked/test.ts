import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest(
  'calls `onError` instead of throwing when the Trusted Types policy is not allowed',
  async ({ browserName, getLocalTestUrl, page }) => {
    sentryTest.skip(browserName !== 'chromium', 'Not all tested browser versions enforce Trusted Types');

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await page.waitForFunction(() => (window as any)._subjectDone);

    expect(await page.evaluate(() => (window as any)._thrownError)).toBeUndefined();
    expect(await page.evaluate(() => (window as any)._reportDialogError)).toBe(
      'Failed to load the report dialog script',
    );
  },
);
