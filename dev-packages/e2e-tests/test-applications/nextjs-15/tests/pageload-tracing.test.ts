import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('all server component transactions should be attached to the pageload request span', async ({ page }) => {
  const pageServerComponentTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/pageload-tracing)';
  });

  const layoutServerComponentTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'Layout Server Component (/pageload-tracing)';
  });

  const metadataTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'Page.generateMetadata (/pageload-tracing)';
  });

  const pageloadTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === '/pageload-tracing';
  });

  await page.goto(`/pageload-tracing`);

  const [pageServerComponentTransaction, layoutServerComponentTransaction, metadataTransaction, pageloadTransaction] =
    await Promise.all([
      pageServerComponentTransactionPromise,
      layoutServerComponentTransactionPromise,
      metadataTransactionPromise,
      pageloadTransactionPromise,
    ]);

  const pageloadTraceId = pageloadTransaction.contexts?.trace?.trace_id;

  expect(pageloadTraceId).toBeTruthy();
  expect(pageServerComponentTransaction.contexts?.trace?.trace_id).toBe(pageloadTraceId);
  expect(layoutServerComponentTransaction.contexts?.trace?.trace_id).toBe(pageloadTraceId);
  expect(metadataTransaction.contexts?.trace?.trace_id).toBe(pageloadTraceId);
});
