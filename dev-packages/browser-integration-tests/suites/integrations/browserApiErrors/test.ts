import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';

/**
 * This test demonstrates an unfortunate edge case with our EventTarget.addEventListener instrumentation.
 * If a listener is registered before Sentry.init() and then again, the same listener is added
 * after Sentry.init(), our `browserApiErrorsIntegration`'s instrumentation causes the listener to be
 * added twice, while without the integration it would only be added and invoked once.
 *
 * Real-life example of such an issue:
 * https://github.com/getsentry/sentry-javascript/issues/16398
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

    expect(consoleLogs).toHaveLength(2);
    expect(consoleLogs).toEqual(['clicked', 'clicked']);
  },
);
