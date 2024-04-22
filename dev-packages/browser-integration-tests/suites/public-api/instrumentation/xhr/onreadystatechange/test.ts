import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';

sentryTest(
  'should not call XMLHttpRequest onreadystatechange more than once per state',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const calls = await page.evaluate(() => {
      // @ts-expect-error window.calls defined in subject.js
      return window.calls;
    });

    expect(calls).toEqual({ '4': 1 });
  },
);
