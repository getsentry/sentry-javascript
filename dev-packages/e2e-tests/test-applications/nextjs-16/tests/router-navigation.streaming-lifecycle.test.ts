import { expect, test } from '@playwright/test';
import { waitForNavigationSpan } from './navigation-helpers';

test('Creates a navigation span for `router.push()`', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-push', 'router.push');

  await page.goto('/navigation');
  await page.getByText('router.push()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `router.replace()`', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-replace', 'router.replace');

  await page.goto('/navigation');
  await page.getByText('router.replace()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `router.back()`', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-back', 'router.traverse');

  await page.goto('/navigation/1337/router-back');
  await page.getByText('Go back home').click();
  await page.waitForURL('**/navigation');
  await page.getByText('router.back()').click();

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for `router.forward()`', async ({ page }) => {
  await page.goto('/navigation');
  await page.getByText('router.push()').click();
  await page.waitForURL('**/navigation/42/router-push');
  await page.goBack();
  await page.waitForURL('**/navigation');

  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-push', 'router.traverse');

  await page.getByText('router.forward()').click();

  expect(await navigationSpanPromise).toBeDefined();
});
