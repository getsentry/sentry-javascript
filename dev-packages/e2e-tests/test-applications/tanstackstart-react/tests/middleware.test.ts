import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends spans for multiple middlewares and verifies they are siblings under the same parent span', async ({
  page,
}) => {
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

  // Find both middleware spans
  const serverFnMiddlewareSpan = transactionEvent?.spans?.find(
    (span: { description?: string; origin?: string }) =>
      span.description === 'serverFnMiddleware' && span.origin === 'manual.middleware.tanstackstart',
  );
  const globalFunctionMiddlewareSpan = transactionEvent?.spans?.find(
    (span: { description?: string; origin?: string }) =>
      span.description === 'globalFunctionMiddleware' && span.origin === 'manual.middleware.tanstackstart',
  );

  // Verify both middleware spans exist with expected properties
  expect(serverFnMiddlewareSpan).toEqual(
    expect.objectContaining({
      description: 'serverFnMiddleware',
      op: 'middleware.tanstackstart',
      origin: 'manual.middleware.tanstackstart',
      status: 'ok',
    }),
  );
  expect(globalFunctionMiddlewareSpan).toEqual(
    expect.objectContaining({
      description: 'globalFunctionMiddleware',
      op: 'middleware.tanstackstart',
      origin: 'manual.middleware.tanstackstart',
      status: 'ok',
    }),
  );

  // Both middleware spans should be siblings under the same parent
  expect(serverFnMiddlewareSpan?.parent_span_id).toBe(globalFunctionMiddlewareSpan?.parent_span_id);
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

test('Sends spans for global request middleware', async ({ page }) => {
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

test('Sends spans for server route request middleware', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/test-middleware'
    );
  });

  await page.goto('/api/test-middleware');

  const transactionEvent = await transactionEventPromise;

  expect(Array.isArray(transactionEvent?.spans)).toBe(true);

  // Check for the server route request middleware span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'serverRouteRequestMiddleware',
        op: 'middleware.tanstackstart',
        origin: 'manual.middleware.tanstackstart',
        status: 'ok',
      }),
    ]),
  );
});

test('Sends span for middleware that returns early without calling next()', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-middleware');
  await expect(page.locator('#server-fn-early-return-btn')).toBeVisible();
  await page.locator('#server-fn-early-return-btn').click();

  const transactionEvent = await transactionEventPromise;

  expect(Array.isArray(transactionEvent?.spans)).toBe(true);

  // Check for the early return middleware span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'earlyReturnMiddleware',
        op: 'middleware.tanstackstart',
        origin: 'manual.middleware.tanstackstart',
        status: 'ok',
      }),
    ]),
  );
});

test('Sends span for middleware that throws an error', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-middleware');
  await expect(page.locator('#server-fn-error-btn')).toBeVisible();
  await page.locator('#server-fn-error-btn').click();

  const transactionEvent = await transactionEventPromise;

  expect(Array.isArray(transactionEvent?.spans)).toBe(true);

  // Check for the error middleware span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'errorMiddleware',
        op: 'middleware.tanstackstart',
        origin: 'manual.middleware.tanstackstart',
      }),
    ]),
  );
});
