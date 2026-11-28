import { expect, test } from '@playwright/test';
import { waitForNavigationSpan } from './navigation-helpers';

test('Creates a navigation span for browser-back', async ({ page }) => {
  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/browser-back', 'router.traverse');

  await page.goto('/navigation/42/browser-back');
  await page.getByText('Go back home').click();
  await page.waitForURL('**/navigation', { waitUntil: 'commit' });
  await expect(page.getByText('router.push()', { exact: true })).toBeEnabled();
  await page.goBack({ waitUntil: 'commit' });

  expect(await navigationSpanPromise).toBeDefined();
});

test('Creates a navigation span for browser-forward', async ({ page }) => {
  await page.goto('/navigation');
  await page.getByText('router.push()').click();
  await page.waitForURL('**/navigation/42/router-push', { waitUntil: 'commit' });
  await expect(page.getByText('hello world', { exact: true })).toBeVisible();
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForURL('**/navigation', { waitUntil: 'commit' });
  await expect(page.getByText('router.push()', { exact: true })).toBeEnabled();

  const navigationSpanPromise = waitForNavigationSpan('/navigation/:param/router-push', 'router.traverse');

  await page.goForward({ waitUntil: 'commit' });

  expect(await navigationSpanPromise).toBeDefined();
});
