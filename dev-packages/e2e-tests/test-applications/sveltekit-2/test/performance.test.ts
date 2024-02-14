import { expect, test } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';
import { waitForInitialPageload } from './utils';

test.describe('performance events', () => {
  test('capture a distributed pageload trace', async ({ page }) => {
    await page.goto('/users/123xyz');

    const clientTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === '/users/[id]';
    });

    const serverTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === 'GET /users/[id]';
    });

    const [clientTxnEvent, serverTxnEvent, _] = await Promise.all([
      clientTxnEventPromise,
      serverTxnEventPromise,
      expect(page.getByText('User id: 123xyz')).toBeVisible(),
    ]);

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

    expect(clientTxnEvent.spans?.length).toBeGreaterThan(5);

    // connected trace
    expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(serverTxnEvent.contexts?.trace?.trace_id);

    // weird but server txn is parent of client txn
    expect(clientTxnEvent.contexts?.trace?.parent_span_id).toBe(serverTxnEvent.contexts?.trace?.span_id);
  });

  test('capture a distributed navigation trace', async ({ page }) => {
    await waitForInitialPageload(page);

    const clientNavigationTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === '/users' && txnEvent.contexts?.trace?.op === 'navigation';
    });

    const serverTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === 'GET /users';
    });

    // navigation to page
    const clickPromise = page.getByText('Route with Server Load').click();

    const [clientTxnEvent, serverTxnEvent, _1, _2] = await Promise.all([
      clientNavigationTxnEventPromise,
      serverTxnEventPromise,
      clickPromise,
      expect(page.getByText('Hi everyone')).toBeVisible(),
    ]);

    expect(clientTxnEvent).toMatchObject({
      transaction: '/users',
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
      transaction: 'GET /users',
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

  test('record client-side universal load fetch span and trace', async ({ page }) => {
    await waitForInitialPageload(page);

    const clientNavigationTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === '/universal-load-fetch' && txnEvent.contexts?.trace?.op === 'navigation';
    });

    // this transaction should be created because of the fetch call
    // it should also be part of the trace
    const serverTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === 'GET /api/users';
    });

    // navigation to page
    const clickPromise = page.getByText('Route with fetch in universal load').click();

    const [clientTxnEvent, serverTxnEvent, _1, _2] = await Promise.all([
      clientNavigationTxnEventPromise,
      serverTxnEventPromise,
      clickPromise,
      expect(page.getByText('alice')).toBeVisible(),
    ]);

    expect(clientTxnEvent).toMatchObject({
      transaction: '/universal-load-fetch',
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
      transaction: 'GET /api/users',
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

    const clientFetchSpan = clientTxnEvent.spans?.find(s => s.op === 'http.client');

    expect(clientFetchSpan).toMatchObject({
      description: expect.stringMatching(/^GET.*\/api\/users/),
      op: 'http.client',
      origin: 'auto.http.browser',
      data: {
        url: expect.stringContaining('/api/users'),
        type: 'fetch',
        'http.method': 'GET',
        'http.response.status_code': 200,
        'network.protocol.version': '1.1',
        'network.protocol.name': 'http',
        'http.request.redirect_start': expect.any(Number),
        'http.request.fetch_start': expect.any(Number),
        'http.request.domain_lookup_start': expect.any(Number),
        'http.request.domain_lookup_end': expect.any(Number),
        'http.request.connect_start': expect.any(Number),
        'http.request.secure_connection_start': expect.any(Number),
        'http.request.connection_end': expect.any(Number),
        'http.request.request_start': expect.any(Number),
        'http.request.response_start': expect.any(Number),
        'http.request.response_end': expect.any(Number),
      },
    });
  });

  test.only('captures a navigation transaction directly after pageload', async ({ page }) => {
    await page.goto('/');

    const clientPageloadTxnPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.contexts?.trace?.op === 'pageload';
    });

    const clientNavigationTxnPromise = waitForTransaction('sveltekit-2', txnEvent => {
      console.log(txnEvent);
      return txnEvent?.contexts?.trace?.op === 'navigation';
    });

    const navigationClickPromise = page.locator('#routeWithParamsLink').click();

    const [pageloadTxnEvent, navigationTxnEvent, _] = await Promise.all([
      clientPageloadTxnPromise,
      clientNavigationTxnPromise,
      navigationClickPromise,
    ]);

    expect(pageloadTxnEvent).toMatchObject({
      transaction: '/',
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

    expect(navigationTxnEvent).toMatchObject({
      transaction: '/users/[id]',
      tags: { runtime: 'browser' },
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        trace: {
          op: 'http.server',
          origin: 'auto.http.sveltekit',
        },
      },
    });
  });
});
