import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a server function transaction with auto-instrumentation', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react-static', transactionEvent => {
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
        description: 'GET /_serverFn/testLog',
        op: 'function',
        origin: 'auto.function.tanstackstart.server',
        data: {
          'sentry.op': 'function',
          'sentry.origin': 'auto.function.tanstackstart.server',
          'code.function.name': 'testLog',
          'http.request.method': 'GET',
          'code.file.path': 'app/routes/test-serverFn.tsx',
        },
        status: 'ok',
      }),
    ]),
  );
});

test('Sends a server function transaction for a nested server function', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('tanstackstart-react-static', transactionEvent => {
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
        description: 'GET /_serverFn/testNestedLog',
        op: 'function',
        origin: 'auto.function.tanstackstart.server',
        data: {
          'sentry.op': 'function',
          'sentry.origin': 'auto.function.tanstackstart.server',
          'code.function.name': 'testNestedLog',
          'http.request.method': 'GET',
          'code.file.path': 'app/routes/test-serverFn.tsx',
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

  const outerSpan = transactionEvent?.spans?.find(span => span.description === 'GET /_serverFn/testNestedLog');
  const manualSpan = transactionEvent?.spans?.find(
    span => span.description === 'testNestedLog' && span.origin === 'manual',
  );

  expect(manualSpan?.parent_span_id).toBe(outerSpan?.span_id);

  // The server function called inside the manual span gets its own span
  expect(transactionEvent?.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'GET /_serverFn/testLog',
        origin: 'auto.function.tanstackstart.server',
        parent_span_id: manualSpan?.span_id,
        status: 'ok',
      }),
      expect.objectContaining({
        description: 'globalFunctionMiddleware',
        origin: 'auto.middleware.tanstackstart',
        parent_span_id: outerSpan?.span_id,
      }),
    ]),
  );
});
