import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';

sentryTest(
  'should not call XMLHttpRequest onreadystatechange more than once per state',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto(url);

    // Wait until XHR is done
    await page.waitForFunction('window.calls["4"]');

    const calls = await page.evaluate('window.calls');

    expect(calls).toEqual({
      '2': 1,
      '3': 1,
      '4': 1,
    });
  },
);
