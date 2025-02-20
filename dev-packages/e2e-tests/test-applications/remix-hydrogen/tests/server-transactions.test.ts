import { expect, test } from '@playwright/test';
import { uuid4 } from '@sentry/core';

import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe.configure({ mode: 'serial' });

test('Sends parameterized transaction name to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('remix-hydrogen', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/user/123');

  const transaction = await transactionPromise;

  expect(transaction).toBeDefined();
  expect(transaction.transaction).toBe('GET /user/123');
});

test('Sends two linked transactions (server & client) to Sentry', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = uuid4();

  const httpServerTransactionPromise = waitForTransaction('remix-hydrogen', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  const pageLoadTransactionPromise = waitForTransaction('remix-hydrogen', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  page.goto(`/?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;
  const loaderSpanId = httpServerTransaction?.spans?.find(span => span.op === 'function.remix.loader')?.span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;

  expect(httpServerTransaction.transaction).toBe('GET /');
  expect(pageloadTransaction.transaction).toBe('routes/_index');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();
  expect(loaderSpanId).toBeDefined();

  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});
