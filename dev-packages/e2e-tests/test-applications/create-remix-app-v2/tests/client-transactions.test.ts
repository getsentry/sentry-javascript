import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-v2', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-v2', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/user/:id';
  });

  await page.goto('/');

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
});

test('Server-Timing header contains sentry-trace and baggage for the root route', async ({ page }) => {
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/') && response.status() === 200);

  await page.goto('/');

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');
});

test('Server-Timing header contains sentry-trace and baggage for a sub-route', async ({ page }) => {
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/user/123') && response.status() === 200,
  );

  await page.goto('/user/123');

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');
});
