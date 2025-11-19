import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction for middleware', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-pages-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.contexts?.trace?.status).toBe('ok');
  expect(middlewareTransaction.contexts?.trace?.op).toBe('http.server.middleware');
  expect(middlewareTransaction.contexts?.runtime?.name).toBe('vercel-edge');
  expect(middlewareTransaction.transaction_info?.source).toBe('url');

  // Assert that isolation scope works properly
  expect(middlewareTransaction.tags?.['my-isolated-tag']).toBe(true);
  expect(middlewareTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});

test('Faulty middlewares', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-pages-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  const errorEventPromise = waitForError('nextjs-pages-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Middleware Error';
  });

  request.get('/api/endpoint-behind-faulty-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  await test.step('should record transactions', async () => {
    const middlewareTransaction = await middlewareTransactionPromise;
    expect(middlewareTransaction.contexts?.trace?.status).toBe('internal_error');
    expect(middlewareTransaction.contexts?.trace?.op).toBe('http.server.middleware');
    expect(middlewareTransaction.contexts?.runtime?.name).toBe('vercel-edge');
    expect(middlewareTransaction.transaction_info?.source).toBe('url');
  });

  await test.step('should record exceptions', async () => {
    const errorEvent = await errorEventPromise;

    // Assert that isolation scope works properly
    expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
    expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
    expect(errorEvent.transaction).toBe('middleware GET');
  });
});

test('Should trace outgoing fetch requests inside middleware and create breadcrumbs for it', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-pages-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'middleware GET' &&
      !!transactionEvent.spans?.find(span => span.op === 'http.client')
    );
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-make-request': '1' } }).catch(() => {
    // Noop
  });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.spans).toEqual(
    expect.arrayContaining([
      {
        data: {
          'http.method': 'GET',
          'http.response.status_code': 200,
          type: 'fetch',
          url: 'http://localhost:3030/',
          'http.url': 'http://localhost:3030/',
          'server.address': 'localhost:3030',
          'sentry.op': 'http.client',
          'sentry.origin': 'auto.http.wintercg_fetch',
        },
        description: 'GET http://localhost:3030/',
        op: 'http.client',
        origin: 'auto.http.wintercg_fetch',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    ]),
  );
  expect(middlewareTransaction.breadcrumbs).toEqual(
    expect.arrayContaining([
      {
        category: 'fetch',
        data: { method: 'GET', status_code: 200, url: 'http://localhost:3030/' },
        timestamp: expect.any(Number),
        type: 'http',
      },
    ]),
  );
});
