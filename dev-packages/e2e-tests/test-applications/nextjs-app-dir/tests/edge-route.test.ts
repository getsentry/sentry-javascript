import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';

test('Should create a transaction for edge routes', async ({ request }) => {
  const edgerouteTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /api/edge-endpoint' && transactionEvent?.contexts?.trace?.status === 'ok'
    );
  });

  const response = await request.get('/api/edge-endpoint', {
    headers: {
      'x-yeet': 'test-value',
    },
  });
  expect(await response.json()).toStrictEqual({ name: 'Jim Halpert' });

  const edgerouteTransaction = await edgerouteTransactionPromise;

  expect(edgerouteTransaction.contexts?.trace?.status).toBe('ok');
  expect(edgerouteTransaction.contexts?.trace?.op).toBe('http.server');
  expect(edgerouteTransaction.contexts?.runtime?.name).toBe('vercel-edge');
  expect(edgerouteTransaction.request?.headers?.['x-yeet']).toBe('test-value');
});

test('Should create a transaction with error status for faulty edge routes', async ({ request }) => {
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
  expect(edgerouteTransaction.contexts?.runtime?.name).toBe('vercel-edge');

  // Assert that isolation scope works properly
  expect(edgerouteTransaction.tags?.['my-isolated-tag']).toBe(true);
  expect(edgerouteTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});

test('Should record exceptions for faulty edge routes', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Edge Route Error';
  });

  request.get('/api/error-edge-endpoint').catch(() => {
    // Noop
  });

  const errorEvent = await errorEventPromise;

  // Assert that isolation scope works properly
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});
