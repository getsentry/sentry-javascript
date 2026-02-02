import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a server function transaction with auto-instrumentation', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-serverFn');

  await expect(page.getByText('Call server function', { exact: true })).toBeVisible();

  await page.getByText('Call server function', { exact: true }).click();

  const transactionEvent = await transactionEventPromise;

  // Check for the auto-instrumented server function span
  expect(Array.isArray(transactionEvent?.spans)).toBe(true);
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: expect.stringContaining('GET /_serverFn/'),
        op: 'function.tanstackstart',
        origin: 'auto.function.tanstackstart.server',
        data: {
          'sentry.op': 'function.tanstackstart',
          'sentry.origin': 'auto.function.tanstackstart.server',
          'tanstackstart.function.hash.sha256': expect.any(String),
        },
        status: 'ok',
      }),
    ]),
  );
});

test('Sends a server function transaction for a nested server function only if it is manually instrumented', async ({
  page,
}) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      !!transactionEvent?.transaction?.startsWith('GET /_serverFn')
    );
  });

  await page.goto('/test-serverFn');

  await expect(page.getByText('Call server function nested')).toBeVisible();

  await page.getByText('Call server function nested').click();

  const transactionEvent = await transactionEventPromise;

  expect(Array.isArray(transactionEvent?.spans)).toBe(true);

  // Check for the auto-instrumented server function span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: expect.stringContaining('GET /_serverFn/'),
        op: 'function.tanstackstart',
        origin: 'auto.function.tanstackstart.server',
        data: {
          'sentry.op': 'function.tanstackstart',
          'sentry.origin': 'auto.function.tanstackstart.server',
          'tanstackstart.function.hash.sha256': expect.any(String),
        },
        status: 'ok',
      }),
    ]),
  );

  // Check for the manually instrumented nested span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'testNestedLog',
        origin: 'manual',
        status: 'ok',
      }),
    ]),
  );

  // Verify that globalFunctionMiddleware and testNestedLog are sibling spans under the root
  const functionMiddlewareSpan = transactionEvent?.spans?.find(
    (span: { description?: string; origin?: string }) =>
      span.description === 'globalFunctionMiddleware' && span.origin === 'manual.middleware.tanstackstart',
  );
  const nestedSpan = transactionEvent?.spans?.find(
    (span: { description?: string; origin?: string }) =>
      span.description === 'testNestedLog' && span.origin === 'manual',
  );

  expect(functionMiddlewareSpan).toBeDefined();
  expect(nestedSpan).toBeDefined();

  // Both spans should be siblings under the same parent (root transaction)
  expect(nestedSpan?.parent_span_id).toBe(functionMiddlewareSpan?.parent_span_id);
});
