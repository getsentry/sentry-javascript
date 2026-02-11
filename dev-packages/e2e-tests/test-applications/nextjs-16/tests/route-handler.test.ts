import test, { expect } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction for node route handlers', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
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
  const routehandlerTransactionPromise = waitForTransaction('nextjs-16', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handler/[xoxo]/edge';
  });

  const response = await request.get('/route-handler/123/edge', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Edge Route Handler' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
  expect(routehandlerTransaction.contexts?.trace?.data?.['http.request.header.x_charly']).toBe('gomez');
});
