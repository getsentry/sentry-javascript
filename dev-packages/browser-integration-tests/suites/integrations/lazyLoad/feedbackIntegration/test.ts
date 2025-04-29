import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest('it allows to lazy load the feedback integration', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE || '';
  const url = await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true });

  await page.route(`https://browser.sentry-cdn.com/${SDK_VERSION}/feedback.min.js`, route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript;',
      body: "window.Sentry.feedbackIntegration = () => ({ name: 'Feedback', attachTo: () => {} })",
    });
  });

  await page.goto(url);

  await page.waitForFunction('window.Sentry?.getClient()');

  const integrationOutput1 = await page.evaluate('window.Sentry.feedbackIntegration?._isShim');

  // Multiple cases are possible here:
  // 1. Bundle without feedback, should have _isShim property
  if (bundle.startsWith('bundle') && !bundle.includes('feedback')) {
    expect(integrationOutput1).toBe(true);
  } else {
    // 2. Either bundle with feedback, or ESM, should not have _isShim property
    expect(integrationOutput1).toBe(undefined);
  }

  await page.evaluate('window._testLazyLoadIntegration()');
  await page.waitForFunction('window._integrationLoaded');

  const integrationOutput2 = await page.evaluate('window.Sentry.feedbackIntegration?._isShim');
  expect(integrationOutput2).toBe(undefined);
});
