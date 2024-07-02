import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  const pageloadTransactionEventPromise = waitForTransaction('create-next-app', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: '/',
      tags: { runtime: 'browser' },
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        react: {
          version: '18.2.0',
        },
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          op: 'pageload',
          origin: 'auto.pageload.nextjs.pages_router_instrumentation',
          data: expect.objectContaining({
            'sentry.idle_span_finish_reason': 'idleTimeout',
            'sentry.op': 'pageload',
            'sentry.origin': 'auto.pageload.nextjs.pages_router_instrumentation',
            'sentry.sample_rate': 1,
            'sentry.source': 'route',
          }),
        },
      },
      request: {
        headers: {
          'User-Agent': expect.any(String),
        },
        url: 'http://localhost:3030/',
      },
    }),
  );
});

test('captures a navigation transcation to Sentry', async ({ page }) => {
  const clientNavigationTxnEventPromise = waitForTransaction('create-next-app', txnEvent => {
    return txnEvent?.transaction === '/user/[id]';
  });

  await page.goto('/');

  // navigation to page
  const clickPromise = page.getByText('navigate').click();

  const [clientTxnEvent, serverTxnEvent, _1] = await Promise.all([clientNavigationTxnEventPromise, clickPromise]);

  expect(clientTxnEvent).toEqual(
    expect.objectContaining({
      transaction: '/user/[id]',
      tags: { runtime: 'browser' },
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        react: {
          version: '18.2.0',
        },
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
          op: 'navigation',
          origin: 'auto.navigation.nextjs.pages_router_instrumentation',
          data: expect.objectContaining({
            'sentry.idle_span_finish_reason': 'idleTimeout',
            'sentry.op': 'navigation',
            'sentry.origin': 'auto.navigation.nextjs.pages_router_instrumentation',
            'sentry.sample_rate': 1,
            'sentry.source': 'route',
          }),
        },
      },
      request: {
        headers: {
          'User-Agent': expect.any(String),
        },
        url: 'http://localhost:3030/user/5',
      },
    }),
  );
});
