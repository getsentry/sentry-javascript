import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a navigation span for `router.push()`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return (
      span.name === `/navigation/:param/router-push` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.push'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.push()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `router.replace()`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return (
      span.name === `/navigation/:param/router-replace` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.replace'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('router.replace()').click();

  expect(await navigationSpanPromise).toBeDefined();
});
