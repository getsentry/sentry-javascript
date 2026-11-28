import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates a navigation span for `<Link />`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return (
      span.name === `/navigation/:param/link` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.push'
    );
  });

  await page.goto('/navigation');
  await page.getByText('Normal Link').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `<Link replace />`', async ({ page }) => {
  const navigationSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return (
      span.name === `/navigation/:param/link-replace` &&
      getSpanOp(span) === 'navigation' &&
      span.attributes['navigation.type']?.value === 'router.replace'
    );
  });

  await page.goto('/navigation');
  await page.waitForTimeout(3000);
  await page.getByText('Link Replace').click();

  expect(await navigationSpanPromise).toBeDefined();
});
