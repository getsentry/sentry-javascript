import test, { expect } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

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

test('Should report an error with a parameterized transaction name for a throwing route handler', async ({
  request,
}) => {
  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'route-handler-error') ?? false;
  });

  const transactionEventPromise = waitForTransaction('nextjs-16', transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /route-handler/[xoxo]/error' &&
      transactionEvent?.contexts?.trace?.op === 'http.server'
    );
  });

  request.get('/route-handler/456/error').catch(() => {});

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  // Error event should be part of the same trace as the transaction
  expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);

  // Error should carry the parameterized transaction name
  expect(errorEvent.transaction).toBe('/route-handler/[xoxo]/error');

  expect(errorEvent.contexts?.nextjs).toEqual({
    route_type: 'route',
    router_kind: 'App Router',
    router_path: '/route-handler/[xoxo]/error',
    request_path: '/route-handler/456/error',
  });

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nextjs.on_request_error',
  });

  // Transaction should have parameterized name and internal_error status
  expect(transactionEvent.transaction).toBe('GET /route-handler/[xoxo]/error');
  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');
});
