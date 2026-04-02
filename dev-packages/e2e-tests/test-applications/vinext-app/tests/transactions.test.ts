import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('creates a pageload transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('vinext-app', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace).toMatchObject({
    op: 'pageload',
  });
});

test('creates a transaction for API routes', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('vinext-app', transactionEvent => {
    return transactionEvent?.transaction === 'GET /api/test';
  });

  await fetch(`${baseURL}/api/test`);

  const transaction = await transactionPromise;

  expect(transaction.transaction).toBe('GET /api/test');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});
