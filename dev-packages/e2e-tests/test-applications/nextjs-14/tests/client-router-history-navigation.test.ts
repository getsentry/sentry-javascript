import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a navigation span for `router.back()`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return span.name === `/navigation/:param/router-back` && getSpanOp(span) === 'navigation';
  });

  await page.goto('/navigation/1337/router-back');
  await page.waitForTimeout(3000);
  await page.getByText('Go back home').click();
  await page.waitForTimeout(3000);
  await page.getByText('router.back()').click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.attributes['navigation.type']?.value).toBe('router.back');
});

test('Creates a navigation span for `router.forward()`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return (
      span.name === `/navigation/:param/router-push` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.forward'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.push()').click();
  await page.waitForTimeout(3000);
  await page.goBack();
  await page.waitForTimeout(3000);
  await page.getByText('router.forward()').click();

  expect(await navigationSpanPromise).toBeDefined();
});
