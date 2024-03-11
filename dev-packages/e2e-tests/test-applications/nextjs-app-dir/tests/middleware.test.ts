import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '../event-proxy-server';

test('Should create a transaction for middleware', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware' && transactionEvent?.contexts?.trace?.status === 'ok';
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.contexts?.trace?.status).toBe('ok');
  expect(middlewareTransaction.contexts?.trace?.op).toBe('middleware.nextjs');
  expect(middlewareTransaction.contexts?.runtime?.name).toBe('vercel-edge');
});

test('Should create a transaction with error status for faulty middleware', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'middleware' && transactionEvent?.contexts?.trace?.status === 'internal_error'
    );
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.contexts?.trace?.status).toBe('internal_error');
  expect(middlewareTransaction.contexts?.trace?.op).toBe('middleware.nextjs');
  expect(middlewareTransaction.contexts?.runtime?.name).toBe('vercel-edge');
});

test('Records exceptions happening in middleware', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Middleware Error';
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  expect(await errorEventPromise).toBeDefined();
});

test('Should trace outgoing fetch requests inside middleware and create breadcrumbs for it', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'middleware' &&
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
          'sentry.op': 'http.client',
          'sentry.origin': 'auto.http.wintercg_fetch',
        },
        description: 'GET http://localhost:3030/',
        op: 'http.client',
        origin: 'auto.http.wintercg_fetch',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      },
    ]),
  );
  expect(middlewareTransaction.breadcrumbs).toEqual(
    expect.arrayContaining([
      {
        category: 'fetch',
        data: { __span: expect.any(String), method: 'GET', status_code: 200, url: 'http://localhost:3030/' },
        timestamp: expect.any(Number),
        type: 'http',
      },
    ]),
  );
});
