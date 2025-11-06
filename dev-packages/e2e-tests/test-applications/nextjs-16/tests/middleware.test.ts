import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

test('Should create a transaction for middleware', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.contexts?.trace?.status).toBe('ok');
  expect(middlewareTransaction.contexts?.trace?.op).toBe('http.server.middleware');
  expect(middlewareTransaction.contexts?.runtime?.name).toBe('node');
  expect(middlewareTransaction.transaction_info?.source).toBe('route');

  // Assert that isolation scope works properly
  expect(middlewareTransaction.tags?.['my-isolated-tag']).toBe(true);
  expect(middlewareTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});

test('Faulty middlewares', async ({ request }) => {
  test.skip(isDevMode, 'Throwing crashes the dev server atm'); // https://github.com/vercel/next.js/issues/85261
  const middlewareTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Middleware Error';
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  await test.step('should record transactions', async () => {
    const middlewareTransaction = await middlewareTransactionPromise;
    expect(middlewareTransaction.contexts?.trace?.status).toBe('internal_error');
    expect(middlewareTransaction.contexts?.trace?.op).toBe('http.server.middleware');
    expect(middlewareTransaction.contexts?.runtime?.name).toBe('node');
    expect(middlewareTransaction.transaction_info?.source).toBe('route');
  });

  // TODO: proxy errors currently not reported via onRequestError
  // await test.step('should record exceptions', async () => {
  //   const errorEvent = await errorEventPromise;

  //   // Assert that isolation scope works properly
  //   expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  //   expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  //   expect([
  //     'middleware GET', // non-otel webpack versions
  //     '/middleware', // middleware file
  //     '/proxy', // proxy file
  //   ]).toContain(errorEvent.transaction);
  // });
});

test('Should trace outgoing fetch requests inside middleware and create breadcrumbs for it', async ({ request }) => {
  test.skip(isDevMode, 'The fetch requests ends up in a separate tx in dev atm');

  const allMiddlewareTransactions: Event[] = [];
  const middlewareTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    console.log('Transaction event:', transactionEvent?.transaction);
    if (transactionEvent?.transaction === 'middleware GET') {
      allMiddlewareTransactions.push(transactionEvent as any);
      console.log(
        'Found middleware transaction, spans:',
        transactionEvent.spans?.map(s => s.op),
      );

      const hasHttpClientSpan = !!transactionEvent.spans?.find(span => span.op === 'http.client');

      // Add diagnostic logging when span is missing to help debug CI failures
      if (!hasHttpClientSpan) {
        console.warn('[TEST] Middleware transaction found but missing http.client span');
        console.warn(
          '[TEST] Available spans:',
          transactionEvent.spans?.map(s => ({ op: s.op, description: s.description })),
        );
        console.warn(
          '[TEST] Breadcrumbs:',
          transactionEvent.breadcrumbs?.filter(b => b.category === 'http'),
        );
      }

      return hasHttpClientSpan;
    }
    return false;
  });

  await request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-make-request': '1' } }).catch(() => {
    // Noop
  });

  console.log('Middleware transaction promise:', JSON.stringify(allMiddlewareTransactions));

  const middlewareTransaction = await middlewareTransactionPromise;

  // Assert breadcrumbs FIRST - these are more reliable as they don't depend on OTEL instrumentation
  expect(middlewareTransaction.breadcrumbs).toEqual(
    expect.arrayContaining([
      {
        category: 'http',
        data: { 'http.method': 'GET', status_code: 200, url: 'http://localhost:3030/' },
        timestamp: expect.any(Number),
        type: 'http',
      },
    ]),
  );

  // Assert the http.client span exists
  // This tests that OTEL fetch instrumentation is working in Next.js middleware
  // If this fails consistently in CI but breadcrumbs pass, it indicates a real instrumentation bug
  expect(middlewareTransaction.spans).toEqual(
    expect.arrayContaining([
      {
        data: {
          'http.request.method': 'GET',
          'http.request.method_original': 'GET',
          'http.response.status_code': 200,
          'network.peer.address': '::1',
          'network.peer.port': 3030,
          'otel.kind': 'CLIENT',
          'sentry.op': 'http.client',
          'sentry.origin': 'auto.http.otel.node_fetch',
          'server.address': 'localhost',
          'server.port': 3030,
          url: 'http://localhost:3030/',
          'url.full': 'http://localhost:3030/',
          'url.path': '/',
          'url.query': '',
          'url.scheme': 'http',
          'user_agent.original': 'node',
        },
        description: 'GET http://localhost:3030/',
        op: 'http.client',
        origin: 'auto.http.otel.node_fetch',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    ]),
  );
});
