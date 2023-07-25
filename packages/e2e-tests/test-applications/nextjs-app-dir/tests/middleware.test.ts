import { test, expect } from '@playwright/test';
import { waitForTransaction, waitForError } from '../event-proxy-server';

test('Should create a transaction for middleware', async ({ request }) => {
  test.skip(process.env.TEST_ENV === 'development', "Doesn't work in dev mode.");

  const middlewareTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware' && transactionEvent?.contexts?.trace?.status === 'ok';
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.contexts?.trace?.status).toBe('ok');
  expect(middlewareTransaction.contexts?.trace?.op).toBe('middleware.nextjs');
  expect(middlewareTransaction.contexts?.runtime?.name).toBe('edge');
});

test('Should create a transaction with error status for faulty middleware', async ({ request }) => {
  test.skip(process.env.TEST_ENV === 'development', "Doesn't work in dev mode.");

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
  expect(middlewareTransaction.contexts?.runtime?.name).toBe('edge');
});

test('Records exceptions happening in middleware', async ({ request }) => {
  test.skip(process.env.TEST_ENV === 'development', "Doesn't work in dev mode.");

  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Middleware Error';
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  expect(await errorEventPromise).toBeDefined();
});
