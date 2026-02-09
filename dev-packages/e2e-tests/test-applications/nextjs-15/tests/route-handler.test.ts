import test, { expect } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction for node route handlers', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handler/[xoxo]/node';
  });

  const response = await request.get('/route-handler/123/node', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Node Route Handler' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');

  // This is flaking on dev mode
  if (process.env.TEST_ENV !== 'development' && process.env.TEST_ENV !== 'dev-turbopack') {
    expect(routehandlerTransaction.contexts?.trace?.data?.['http.request.header.x_charly']).toBe('gomez');
  }
});

test('Should create a transaction for edge route handlers', async ({ request }) => {
  // This test only works for webpack builds on non-async param extraction
  // todo: check if we can set request headers for edge on sdkProcessingMetadata
  test.skip();
  const routehandlerTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handler/[xoxo]/edge';
  });

  const response = await request.get('/route-handler/123/edge', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Edge Route Handler' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
  expect(routehandlerTransaction.contexts?.trace?.data?.['http.request.header.x_charly']).toBe('gomez');
});

test('Should create a transaction for static route handlers', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handler/static';
  });

  const response = await request.get('/route-handler/static');
  expect(await response.json()).toStrictEqual({ name: 'Static' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should create a transaction for route handlers and correctly set span status depending on http status', async ({
  request,
}) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'POST /route-handler/[xoxo]/node';
  });

  const response = await request.post('/route-handler/123/node');
  expect(await response.json()).toStrictEqual({ name: 'Boop' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('invalid_argument');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should record exceptions and transactions for faulty route handlers', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Route handler error';
  });

  const routehandlerTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handler/[xoxo]/error';
  });

  await request.get('/route-handler/123/error').catch(() => {});

  const routehandlerTransaction = await routehandlerTransactionPromise;
  const routehandlerError = await errorEventPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('internal_error');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
  expect(routehandlerTransaction.contexts?.trace?.origin).toContain('auto');

  expect(routehandlerError.exception?.values?.[0].value).toBe('Route handler error');

  expect(routehandlerError.request?.method).toBe('GET');
  expect(routehandlerError.request?.url).toContain('/route-handler/123/error');

  expect(routehandlerError.transaction).toContain('/route-handler/[xoxo]/error');
});
