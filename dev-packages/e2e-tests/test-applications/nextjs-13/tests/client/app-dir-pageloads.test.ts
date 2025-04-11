import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('should create a pageload transaction when the `app` directory is used', async ({ page }) => {
  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === '/pageload-transaction' && transactionEvent.contexts?.trace?.op === 'pageload'
    );
  });

  await page.goto(`/pageload-transaction`);

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    breadcrumbs: expect.arrayContaining([
      {
        category: 'navigation',
        data: { from: '/pageload-transaction', to: '/pageload-transaction' },
        timestamp: expect.any(Number),
      },
    ]),
    contexts: {
      react: { version: expect.any(String) },
      trace: {
        data: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'url',
        },
        op: 'pageload',
        origin: 'auto.pageload.nextjs.app_router_instrumentation',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    request: {
      headers: expect.any(Object),
      url: expect.stringMatching(/\/pageload-transaction$/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: '/pageload-transaction',
    transaction_info: { source: 'url' },
    type: 'transaction',
  });
});
