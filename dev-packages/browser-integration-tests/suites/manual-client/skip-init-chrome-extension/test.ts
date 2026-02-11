import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { hasDebugLogs } from '../../../utils/helpers';

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

  const isEnabled = await page.evaluate(() => {
    return !!(window as any).Sentry.getClient()?.getOptions().enabled;
  });

  expect(isInitialized).toEqual(true);
  expect(isEnabled).toEqual(false);

  if (hasDebugLogs()) {
    expect(errorLogs.length).toEqual(1);
    expect(errorLogs[0]).toEqual(
      '[Sentry] You cannot use Sentry.init() in a browser extension, see: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
    );
  } else {
    expect(errorLogs.length).toEqual(0);
  }
});
