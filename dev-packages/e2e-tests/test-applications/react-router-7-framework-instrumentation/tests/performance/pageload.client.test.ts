import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('client - instrumentation API pageload', () => {
  test('should send pageload transaction', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          op: 'pageload',
          data: {
            'url.template': '/performance',
            // react-router-serve 301-redirects the bare index route to a trailing slash in prod, while
            // the dev server serves it without - accept both.
            'url.path': expect.stringMatching(/^\/performance\/?$/),
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/?$/),
          },
        },
      },
      transaction: '/performance',
      type: 'transaction',
    });
  });

  test('parameterizes the pageload transaction for dynamic routes', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/with/:param' &&
        transactionEvent.contexts?.trace?.op === 'pageload'
      );
    });

    await page.goto(`/performance/with/some-param`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          op: 'pageload',
          data: {
            'sentry.source': 'route',
            'url.template': '/performance/with/:param',
            'url.path': '/performance/with/some-param',
            'url.full': expect.stringMatching(/^https?:\/\/localhost:\d+\/performance\/with\/some-param$/),
          },
        },
      },
      transaction: '/performance/with/:param',
      type: 'transaction',
      transaction_info: { source: 'route' },
    });
  });

  test('should link server and client transactions with same trace_id', async ({ page }) => {
    const serverTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === 'GET /performance' && transactionEvent.contexts?.trace?.op === 'http.server'
      );
    });

    const clientTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/performance' && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`/performance`);

    const [serverTx, clientTx] = await Promise.all([serverTxPromise, clientTxPromise]);

    // Both transactions should share the same trace_id
    expect(serverTx.contexts?.trace?.trace_id).toBeDefined();
    expect(clientTx.contexts?.trace?.trace_id).toBeDefined();
    expect(serverTx.contexts?.trace?.trace_id).toBe(clientTx.contexts?.trace?.trace_id);

    // But have different span_ids
    expect(serverTx.contexts?.trace?.span_id).not.toBe(clientTx.contexts?.trace?.span_id);
  });
});
