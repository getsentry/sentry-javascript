import test, { expect } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction for node route handlers', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-16-bun', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handler/[xoxo]/node';
  });

  const response = await request.get('/route-handler/123/node', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Node Route Handler' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});
