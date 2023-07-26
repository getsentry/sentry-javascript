import { test, expect } from '@playwright/test';
import { waitForTransaction, waitForError } from '../event-proxy-server';

test('Should create a transaction for edge routes', async ({ request }) => {
  test.skip(process.env.TEST_ENV === 'development', "Doesn't work in dev mode.");

  const edgerouteTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /api/edge-endpoint' && transactionEvent?.contexts?.trace?.status === 'ok'
    );
  });

  const response = await request.get('/api/edge-endpoint');
  expect(await response.json()).toStrictEqual({ name: 'Jim Halpert' });

  const edgerouteTransaction = await edgerouteTransactionPromise;

  expect(edgerouteTransaction.contexts?.trace?.status).toBe('ok');
  expect(edgerouteTransaction.contexts?.trace?.op).toBe('http.server');
  expect(edgerouteTransaction.contexts?.runtime?.name).toBe('edge');
});

test('Should create a transaction with error status for faulty edge routes', async ({ request }) => {
  test.skip(process.env.TEST_ENV === 'development', "Doesn't work in dev mode.");

  const edgerouteTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /api/error-edge-endpoint' &&
      transactionEvent?.contexts?.trace?.status === 'internal_error'
    );
  });

  request.get('/api/error-edge-endpoint').catch(() => {
    // Noop
  });

  const edgerouteTransaction = await edgerouteTransactionPromise;

  expect(edgerouteTransaction.contexts?.trace?.status).toBe('internal_error');
  expect(edgerouteTransaction.contexts?.trace?.op).toBe('http.server');
  expect(edgerouteTransaction.contexts?.runtime?.name).toBe('edge');
});

test('Should record exceptions for faulty edge routes', async ({ request }) => {
  test.skip(process.env.TEST_ENV === 'development', "Doesn't work in dev mode.");

  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Edge Route Error';
  });

  request.get('/api/error-edge-endpoint').catch(() => {
    // Noop
  });

  expect(await errorEventPromise).toBeDefined();
});
