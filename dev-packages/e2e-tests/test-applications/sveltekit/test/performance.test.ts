import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';
import { waitForInitialPageload } from '../utils.js';

test('sends a pageload transaction', async ({ page }) => {
  const pageloadTransactionEventPromise = waitForTransaction('sveltekit', (transactionEvent: any) => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent).toMatchObject({
    transaction: '/',
    transaction_info: {
      source: 'route',
    },
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.sveltekit',
      },
    },
  });
});

test('captures a distributed pageload trace', async ({ page }) => {
  const clientTxnEventPromise = waitForTransaction('sveltekit', txnEvent => {
    return txnEvent?.transaction === '/users/[id]';
  });

  const serverTxnEventPromise = waitForTransaction('sveltekit', txnEvent => {
    return txnEvent?.transaction === 'GET /users/[id]';
  });

  await page.goto('/users/123xyz');

  const [clientTxnEvent, serverTxnEvent] = await Promise.all([clientTxnEventPromise, serverTxnEventPromise]);

  expect(clientTxnEvent).toMatchObject({
    transaction: '/users/[id]',
    tags: { runtime: 'browser' },
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'pageload',
        origin: 'auto.pageload.sveltekit',
      },
    },
  });

  expect(serverTxnEvent).toMatchObject({
    transaction: 'GET /users/[id]',
    tags: { runtime: 'node' },
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'http.server',
        origin: 'auto.http.sveltekit',
      },
    },
  });
  // connected trace
  expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(serverTxnEvent.contexts?.trace?.trace_id);

  // weird but server txn is parent of client txn
  expect(clientTxnEvent.contexts?.trace?.parent_span_id).toBe(serverTxnEvent.contexts?.trace?.span_id);
});

test('captures a distributed navigation trace', async ({ page }) => {
  const clientNavigationTxnEventPromise = waitForTransaction('sveltekit', txnEvent => {
    return txnEvent?.transaction === '/users/[id]';
  });

  const serverTxnEventPromise = waitForTransaction('sveltekit', txnEvent => {
    return txnEvent?.transaction === 'GET /users/[id]';
  });

  await waitForInitialPageload(page);

  // navigation to page
  const clickPromise = page.getByText('Route with Params').click();

  const [clientTxnEvent, serverTxnEvent, _1] = await Promise.all([
    clientNavigationTxnEventPromise,
    serverTxnEventPromise,
    clickPromise,
  ]);

  expect(clientTxnEvent).toMatchObject({
    transaction: '/users/[id]',
    tags: { runtime: 'browser' },
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'navigation',
        origin: 'auto.navigation.sveltekit',
      },
    },
  });

  expect(serverTxnEvent).toMatchObject({
    transaction: 'GET /users/[id]',
    tags: { runtime: 'node' },
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'http.server',
        origin: 'auto.http.sveltekit',
      },
    },
  });

  // trace is connected
  expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(serverTxnEvent.contexts?.trace?.trace_id);
});
