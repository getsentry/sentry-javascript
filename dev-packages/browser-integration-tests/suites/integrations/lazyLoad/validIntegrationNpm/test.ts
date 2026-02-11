import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest('it allows to lazy load an integration when using the NPM package', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE || '';
  // We only want to run this in non-CDN bundle mode
  if (bundle.startsWith('bundle')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route(`https://browser.sentry-cdn.com/${SDK_VERSION}/httpclient.min.js`, route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript;',
      body: "window.Sentry = window.Sentry || {};window.Sentry.httpClientIntegration = () => ({ name: 'HttpClient' })",
    });
  });

  await page.goto(url);

  const hasIntegration = await page.evaluate('!!window._testSentry.getClient().getIntegrationByName("HttpClient")');
  expect(hasIntegration).toBe(false);

  const scriptTagsBefore = await page.evaluate<number>('document.querySelectorAll("script").length');

  await page.evaluate('window._testLazyLoadIntegration()');
  await page.waitForFunction('window._integrationLoaded');

  const scriptTagsAfter = await page.evaluate<number>('document.querySelectorAll("script").length');

  const hasIntegration2 = await page.evaluate('!!window._testSentry.getClient().getIntegrationByName("HttpClient")');
  expect(hasIntegration2).toBe(true);

  expect(scriptTagsAfter).toBe(scriptTagsBefore + 1);
});
