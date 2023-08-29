import { test, expect } from '@playwright/test';
import { waitForTransaction, waitForError } from '../event-proxy-server';

test('Should create a transaction for route handlers (GET)', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handlers/[param]';
  });

  const response = await request.get('/route-handlers/foo');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should create a transaction for route handlers (POST)', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'POST /route-handlers/[param]';
  });

  const response = await request.post('/route-handlers/bar');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('not_found');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should record exceptions and transactions for faulty route handlers', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'route-handler-error';
  });

  const routehandlerTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'PUT /route-handlers/[param]/error';
  });

  void request.put('/route-handlers/baz/error');

  const routehandlerTransaction = await routehandlerTransactionPromise;
  const routehandlerError = await errorEventPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('internal_error');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');

  expect(routehandlerError).toBe(1);
});
