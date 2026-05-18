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

    await page.goto(`/performance/with-middleware`);

    const serverTx = await serverTxPromise;
    const pageloadTx = await pageloadTxPromise;

    const traceIds = {
      server: serverTx?.contexts?.trace?.trace_id,
      pageload: pageloadTx?.contexts?.trace?.trace_id,
    };

    expect(pageloadTx).toBeDefined();

    // The app awaits Sentry.startSpan around the middleware `next()` call, so the manual
    // middleware span belongs to the request transaction instead of becoming a root transaction.
    const customMiddlewareSpans =
      serverTx.spans?.filter(span => {
        return span.description === 'authMiddleware' && span.op === 'middleware.auth';
      }) ?? [];

    expect(customMiddlewareSpans).toHaveLength(1);

    // Assert that all transactions belong to the same trace
    expect(traceIds.server).toBe(traceIds.pageload);
  });
});
