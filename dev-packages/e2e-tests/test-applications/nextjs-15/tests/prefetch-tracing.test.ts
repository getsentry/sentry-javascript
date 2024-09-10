import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should capture transactions with `http.server.prefetch` op for prefetch traces', async ({ page }) => {
  const serverPrefetchTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /prefetchable-page';
  });

  await page.goto(`/page-with-prefetch`);

  const serverPrefetchTransaction = await serverPrefetchTransactionPromise;
  expect(serverPrefetchTransaction.contexts?.trace?.op).toBe('http.server.prefetch');
});
