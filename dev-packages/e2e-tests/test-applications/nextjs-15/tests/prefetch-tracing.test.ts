import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should capture transactions with `http.server.prefetch` op for prefetch traces', async ({ page }) => {
  const serverPrefetchTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /prefetchable-page';
  });

  const pageloadTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === '/page-with-prefetch';
  });

  await page.goto(`/pageload-tracing`);

  const [serverPrefetchTransaction, pageloadTransaction] = await Promise.all([
    serverPrefetchTransactionPromise,
    pageloadTransactionPromise,
  ]);

  const pageloadTraceId = pageloadTransaction.contexts?.trace?.trace_id;

  expect(pageloadTraceId).toBeTruthy();
  expect(serverPrefetchTransaction.contexts?.trace?.trace_id).toBe(pageloadTraceId);

  expect(serverPrefetchTransaction.contexts?.trace?.op).toBe('http.server.prefetch');
});
