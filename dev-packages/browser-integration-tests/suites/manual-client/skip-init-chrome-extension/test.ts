import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';

sentryTest('should not initialize when inside a Chrome browser extension', async ({ getLocalTestUrl, page }) => {
  const errorLogs: string[] = [];

  page.on('console', message => {
    if (message.type() === 'error') errorLogs.push(message.text());
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const isInitialized = await page.evaluate(() => {
    return !!(window as any).Sentry.isInitialized();
  });

  expect(isInitialized).toEqual(false);
  expect(errorLogs.length).toEqual(1);
  expect(errorLogs[0]).toEqual(
    '[Sentry] You cannot run Sentry this way in a browser extension, check: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
  );
});
