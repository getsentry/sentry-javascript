import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest('lazy loads an integration on pages that enforce Trusted Types', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route(`https://browser.sentry-cdn.com/${SDK_VERSION}/httpclient.min.js`, route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript;',
      body: "window.Sentry.httpClientIntegration = () => ({ name: 'HttpClient' })",
    });
  });

  await page.addInitScript(() => {
    (window as any)._violations = [];
    document.addEventListener('securitypolicyviolation', event => {
      (window as any)._violations.push(`${event.violatedDirective}: ${event.sample}`);
    });
  });

  await page.goto(url);

  await page.evaluate(() => (window as any)._testLazyLoadIntegration());

  expect(await page.evaluate(() => (window as any)._integrationLoaded)).toBe(true);
  expect(await page.evaluate(() => (window as any)._violations)).toEqual([]);
});
