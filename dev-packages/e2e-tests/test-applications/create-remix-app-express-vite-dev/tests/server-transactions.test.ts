import { expect, test } from '@playwright/test';

import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe.configure({ mode: 'serial' });

test('Sends parameterized transaction name to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express-vite-dev', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/user/123');

  const transaction = await transactionPromise;

  expect(transaction).toBeDefined();
  expect(transaction.transaction).toBe('GET user/:id');
});

test('Sends two linked transactions (server & client) to Sentry', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = crypto.randomUUID();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express-vite-dev', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express-vite-dev', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  page.goto(`/?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;
  const loaderSpanId = httpServerTransaction?.spans?.find(
    span => span.data && span.data['code.function'] === 'loader',
  )?.span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('GET http://localhost:3030/');
  expect(pageloadTransaction.transaction).toBe('/');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(loaderSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});
