import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - middleware', () => {
  test('should send middleware transaction on pageload', async ({ page }) => {
    const serverTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/with-middleware';
    });

    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance/with-middleware';
    });

    const customMiddlewareTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'authMiddleware';
    });

    await page.goto(`/performance/with-middleware`);

    const serverTx = await serverTxPromise;
    const pageloadTx = await pageloadTxPromise;
    const customMiddlewareTx = await customMiddlewareTxPromise;

    const traceIds = {
      server: serverTx?.contexts?.trace?.trace_id,
      pageload: pageloadTx?.contexts?.trace?.trace_id,
      customMiddleware: customMiddlewareTx?.contexts?.trace?.trace_id,
    };

    expect(pageloadTx).toBeDefined();
    expect(customMiddlewareTx).toBeDefined();

    // Assert that all transactions belong to the same trace
    expect(traceIds.server).toBe(traceIds.pageload);
    expect(traceIds.server).toBe(traceIds.customMiddleware);
  });
});
