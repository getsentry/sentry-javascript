/* eslint-disable no-console */
import type { ConsoleMessage } from '@playwright/test';
import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

// Regression test against https://github.com/getsentry/sentry-javascript/issues/4558
sentryTest('should not change console output', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  // https://playwright.dev/docs/api/class-page#page-event-console
  page.on('console', (msg: ConsoleMessage) => {
    expect(msg.text()).toEqual(`hello world ${msg.type()}`);
  });

  await page.goto(url);

  await page.evaluate(() => console.log('hello', 'world', 'log'));

  await page.evaluate(() => console.warn('hello', 'world', 'warning'));

  await page.evaluate(() => console.debug('hello', 'world', 'debug'));
});
