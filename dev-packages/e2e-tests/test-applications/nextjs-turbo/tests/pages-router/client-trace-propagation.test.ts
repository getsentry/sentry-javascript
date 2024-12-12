import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should propagate traces from server to client in pages router', async ({ page }) => {
  const serverTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /[param]/pages-router-client-trace-propagation';
  });

  const pageloadTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === '/[param]/pages-router-client-trace-propagation';
  });

  await page.goto(`/123/pages-router-client-trace-propagation`);

  const serverTransaction = await serverTransactionPromise;
  const pageloadTransaction = await pageloadTransactionPromise;

  expect(serverTransaction.contexts?.trace?.trace_id).toBeDefined();
  expect(pageloadTransaction.contexts?.trace?.trace_id).toBe(serverTransaction.contexts?.trace?.trace_id);
});
