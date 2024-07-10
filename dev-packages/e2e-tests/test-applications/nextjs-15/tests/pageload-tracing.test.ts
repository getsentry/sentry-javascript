import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('App router transactions should be attached to the pageload request span', async ({ page }) => {
  const serverTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /pageload-tracing';
  });

  const pageloadTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === '/pageload-tracing';
  });

  await page.goto(`/pageload-tracing`);

  const [serverTransaction, pageloadTransaction] = await Promise.all([
    serverTransactionPromise,
    pageloadTransactionPromise,
  ]);

  const pageloadTraceId = pageloadTransaction.contexts?.trace?.trace_id;

  expect(pageloadTraceId).toBeTruthy();
  expect(serverTransaction.contexts?.trace?.trace_id).toBe(pageloadTraceId);
});
