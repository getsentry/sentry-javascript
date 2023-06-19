import { test, expect } from '@playwright/test';
import { waitForTransaction, waitForError } from '../../../test-utils/event-proxy-server';

test('Should create a transaction for middleware', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware';
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.contexts?.trace?.status).toBe('ok');
  expect(middlewareTransaction.contexts?.trace?.op).toBe('middleware.nextjs');
  expect(middlewareTransaction.contexts?.runtime?.name).toBe('edge');
});

test('Records exceptions happening in middleware', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Middleware Error';
  });

  await request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } });

  expect(await errorEventPromise).toBeDefined();
});
