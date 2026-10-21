import { expect, test } from '@playwright/test';
import { HTTP_REQUEST_METHOD, URL_FULL } from '@sentry/conventions/attributes';
import { waitForRequest, waitForTransaction } from '@sentry-internal/test-utils';
import type { Event } from '@sentry/core';

test('Tunnel route should proxy pageload transaction to Sentry', async ({ page }) => {
  // Wait for the pageload transaction to be sent through the tunnel
  const pageloadTransactionPromise = waitForTransaction('nextjs-16-tunnel', async transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  // Navigate to the page
  await page.goto('/');

  const pageloadTransaction = await pageloadTransactionPromise;

  // Verify the pageload transaction was received successfully
  expect(pageloadTransaction).toBeDefined();
  expect(pageloadTransaction.transaction).toBe('/');
  expect(pageloadTransaction.contexts?.trace?.op).toBe('pageload');
  expect(pageloadTransaction.contexts?.trace?.status).toBe('ok');
  expect(pageloadTransaction.type).toBe('transaction');
});

test('Tunnel route should send multiple pageload transactions consistently', async ({ page }) => {
  // This test verifies that the tunnel route remains consistent across multiple page loads
  // (important for Turbopack which could generate different tunnel routes for client/server)

  // First pageload
  const firstPageloadPromise = waitForTransaction('nextjs-16-tunnel', async transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.goto('/');
  const firstPageload = await firstPageloadPromise;

  expect(firstPageload).toBeDefined();
  expect(firstPageload.transaction).toBe('/');
  expect(firstPageload.contexts?.trace?.op).toBe('pageload');
  expect(firstPageload.contexts?.trace?.status).toBe('ok');

  // Second pageload (reload)
  const secondPageloadPromise = waitForTransaction('nextjs-16-tunnel', async transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.reload();
  const secondPageload = await secondPageloadPromise;

  expect(secondPageload).toBeDefined();
  expect(secondPageload.transaction).toBe('/');
  expect(secondPageload.contexts?.trace?.op).toBe('pageload');
  expect(secondPageload.contexts?.trace?.status).toBe('ok');
});

test('Tunnel requests should not create middleware or fetch spans', async ({ page }) => {
  // This test verifies that our span filtering logic works correctly
  // The proxy runs on all routes, so we'll get a middleware transaction for `/`
  // But we should NOT get middleware or fetch transactions for the tunnel route itself

  const allTransactions: any[] = [];

  // Collect all transactions
  const collectPromise = (async () => {
    // Keep collecting for 3 seconds after pageload
    const endTime = Date.now() + 3000;
    while (Date.now() < endTime) {
      try {
        const tx = await Promise.race([
          waitForTransaction('nextjs-16-tunnel', () => true),
          new Promise((_, reject) => setTimeout(() => reject(), 500)),
        ]);
        allTransactions.push(tx);
      } catch {
        // Timeout, continue collecting
      }
    }
  })();

  // Wait for pageload transaction
  const pageloadPromise = waitForTransaction('nextjs-16-tunnel', async transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');
  const pageloadTransaction = await pageloadPromise;

  // Trigger errors to force tunnel POST requests
  await page
    .evaluate(() => {
      throw new Error('Test tunnel error 1');
    })
    .catch(() => {
      // Expected to throw
    });

  await page
    .evaluate(() => {
      throw new Error('Test tunnel error 2');
    })
    .catch(() => {
      // Expected to throw
    });

  // Wait for events to be sent through tunnel
  await page.waitForTimeout(2000);

  // Continue collecting for a bit
  await collectPromise;

  // We should have received the pageload transaction
  expect(pageloadTransaction).toBeDefined();
  expect(pageloadTransaction.contexts?.trace?.op).toBe('pageload');

  const middlewareTransactions = allTransactions.filter(tx => tx.contexts?.trace?.op === 'http.server.middleware');

  // We WILL have a middleware transaction for GET / (the pageload)
  // But we should NOT have middleware transactions for POST requests (tunnel route)
  const postMiddlewareTransactions = middlewareTransactions.filter(
    tx => tx.transaction?.includes('POST') || tx.contexts?.trace?.data?.['http.request.method'] === 'POST',
  );

  expect(postMiddlewareTransactions).toHaveLength(0);

  // We should NOT have any fetch transactions to Sentry ingest
  const sentryFetchTransactions = allTransactions.filter(
    tx =>
      tx.contexts?.trace?.op === 'http.client' &&
      (tx.contexts?.trace?.data?.['url.full']?.includes('sentry.io') ||
        tx.contexts?.trace?.data?.['url.full']?.includes('ingest')),
  );

  expect(sentryFetchTransactions).toHaveLength(0);
});

test('Tunnel requests are sent without the cookies of the browser', async ({ page, context, baseURL }) => {
  test.skip(process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE === 'handler', 'The handler variants send the cookies');
  await context.addCookies([{ name: 'session', value: '8f2c1d', url: baseURL }]);
  const proxyRequestPromise = waitForRequest('nextjs-16-tunnel', ({ envelope }) =>
    envelope[1].some(
      ([itemHeader, item]) =>
        itemHeader.type === 'event' && (item as Event).exception?.values?.[0]?.value === 'Tunnel cookie test',
    ),
  );

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as { __SENTRY__?: unknown }).__SENTRY__ === 'object');
  const tunnelRequestPromise = page.waitForRequest(
    request =>
      request.method() === 'POST' &&
      new URL(request.url()).origin === baseURL &&
      (request.postData() ?? '').includes('Tunnel cookie test'),
  );
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('Tunnel cookie test');
    });
  });

  const tunnelRequest = await tunnelRequestPromise;
  const proxyRequest = await proxyRequestPromise;

  expect(await page.evaluate(() => document.cookie)).toBe('session=8f2c1d');
  expect((await tunnelRequest.allHeaders()).cookie).toBeUndefined();
  expect(proxyRequest.rawProxyRequestHeaders.cookie).toBeUndefined();
});

test.describe('Tunnel route handler', () => {
  test.skip(process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE !== 'handler', 'Only the handler variants use the handler');

  test('forwards events without the cookies of the browser', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'session', value: '8f2c1d', url: baseURL }]);
    const proxyRequestPromise = waitForRequest('nextjs-16-tunnel', ({ envelope }) =>
      envelope[1].some(
        ([itemHeader, item]) =>
          itemHeader.type === 'event' &&
          (item as Event).exception?.values?.[0]?.value === 'Tunnel route handler cookie test',
      ),
    );

    await page.goto('/');
    await page.waitForFunction(() => typeof (window as { __SENTRY__?: unknown }).__SENTRY__ === 'object');
    const tunnelRequestPromise = page.waitForRequest(
      request =>
        request.method() === 'POST' &&
        new URL(request.url()).origin === baseURL &&
        (request.postData() ?? '').includes('Tunnel route handler cookie test'),
    );
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('Tunnel route handler cookie test');
      });
    });

    const tunnelRequest = await tunnelRequestPromise;
    const proxyRequest = await proxyRequestPromise;

    expect(new URL(tunnelRequest.url()).search).toBe('');
    expect((await tunnelRequest.allHeaders()).cookie).toBe('session=8f2c1d');
    expect(proxyRequest.rawProxyRequestHeaders.cookie).toBeUndefined();
    expect(proxyRequest.rawProxyRequestHeaders['content-type']).toBe('application/x-sentry-envelope');
  });

  test('does not create server transactions for tunnel requests', async ({ page, baseURL }) => {
    // One listener, so it gets every transaction that the proxy received before the barrier transaction.
    const transactionsBeforeBarrier: Event[] = [];
    const barrierTransactionPromise = waitForTransaction('nextjs-16-tunnel', transaction => {
      transactionsBeforeBarrier.push(transaction);
      return transaction.transaction === 'GET /api/flush';
    });
    const pageloadTunnelResponsePromise = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).origin === baseURL &&
        (response.request().postData() ?? '').includes('pageload'),
    );

    await page.goto('/');
    await pageloadTunnelResponsePromise;
    // Flush the edge client of the edge tunnel route (a 405 on the Node.js one), then the Node.js client twice:
    // the first flush sends the tunnel transactions, the second one the barrier transaction of the first flush.
    await page.request.get('/sentry-tunnel');
    await page.request.get('/api/flush');
    await page.request.get('/api/flush');
    await barrierTransactionPromise;

    const postTransactions = transactionsBeforeBarrier.filter(
      transaction =>
        transaction.transaction?.startsWith('POST') ||
        transaction.contexts?.trace?.data?.[HTTP_REQUEST_METHOD] === 'POST',
    );
    const ingestSpans = transactionsBeforeBarrier
      .flatMap(transaction => transaction.spans ?? [])
      .filter(span => span.op === 'http.client' && String(span.data?.[URL_FULL]).startsWith('http://localhost:3031/'));
    expect(postTransactions).toEqual([]);
    expect(ingestSpans).toEqual([]);
  });
});
