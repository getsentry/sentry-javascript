import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction for middleware', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-16-bun', async transactionEvent => {
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
