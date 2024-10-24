import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction for edge routes', async ({ request }) => {
  const edgerouteTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /api/edge-endpoint' &&
      transactionEvent.contexts?.runtime?.name === 'vercel-edge'
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
  expect(edgerouteTransaction.request?.headers?.['x-yeet']).toBe('test-value');
});

test('Faulty edge routes', async ({ request }) => {
  const edgerouteTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /api/error-edge-endpoint' &&
      transactionEvent.contexts?.runtime?.name === 'vercel-edge'
    );
  });

  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return (
      errorEvent?.exception?.values?.[0]?.value === 'Edge Route Error' &&
      errorEvent.contexts?.runtime?.name === 'vercel-edge'
    );
  });

  request.get('/api/error-edge-endpoint').catch(() => {
    // Noop
  });

  const [edgerouteTransaction, errorEvent] = await Promise.all([
    test.step('should create a transaction', () => edgerouteTransactionPromise),
    test.step('should create an error event', () => errorEventPromise),
  ]);

  test.step('should create transactions with the right fields', () => {
    expect(edgerouteTransaction.contexts?.trace?.status).toBe('unknown_error');
    expect(edgerouteTransaction.contexts?.trace?.op).toBe('http.server');
  });

  test.step('should have scope isolation', () => {
    expect(edgerouteTransaction.tags?.['my-isolated-tag']).toBe(true);
    expect(edgerouteTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
    expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
    expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  });
});
