import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a navigation span for browser-back', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return (
      span.name === `/navigation/:param/browser-back` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'browser.popstate'
    );
  });

  await page.goto('/navigation/42/browser-back');
  await page.waitForTimeout(3000);
  await page.getByText('Go back home').click();
  await page.waitForTimeout(3000);
  await page.goBack();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for browser-forward', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return (
      span.name === `/navigation/:param/router-push` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'browser.popstate'
    );
  });

  await page.goto('/navigation');
  await page.getByText('router.push()').click();
  await page.waitForTimeout(3000);
  await page.goBack();
  await page.waitForTimeout(3000);
  await page.goForward();

  expect(await navigationSpanPromise).toBeDefined();
});
