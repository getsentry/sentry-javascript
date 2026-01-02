import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends spans for server function specific middleware', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-middleware');
  await expect(page.locator('#server-fn-middleware-btn')).toBeVisible();
  await page.locator('#server-fn-middleware-btn').click();

  const transactionEvent = await transactionEventPromise;

  expect(Array.isArray(transactionEvent?.spans)).toBe(true);

  // Check for the server function specific middleware span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'serverFnMiddleware',
        op: 'middleware.tanstackstart',
        origin: 'manual.middleware.tanstackstart',
        data: expect.objectContaining({
          'sentry.op': 'middleware.tanstackstart',
          'sentry.origin': 'manual.middleware.tanstackstart',
        }),
        status: 'ok',
      }),
    ]),
  );
});

test('Sends spans for global function middleware', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-middleware');
  await expect(page.locator('#server-fn-global-only-btn')).toBeVisible();
  await page.locator('#server-fn-global-only-btn').click();

  const transactionEvent = await transactionEventPromise;

  expect(Array.isArray(transactionEvent?.spans)).toBe(true);

  // Check for the global function middleware span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'globalFunctionMiddleware',
        op: 'middleware.tanstackstart',
        origin: 'manual.middleware.tanstackstart',
        status: 'ok',
      }),
    ]),
  );
});

test('Sends spans for global request middleware on page load', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-middleware'
    );
  });

  await page.goto('/test-middleware');

  const transactionEvent = await transactionEventPromise;

  expect(Array.isArray(transactionEvent?.spans)).toBe(true);

  // Check for the global request middleware span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'globalRequestMiddleware',
        op: 'middleware.tanstackstart',
        origin: 'manual.middleware.tanstackstart',
        status: 'ok',
      }),
    ]),
  );
});
