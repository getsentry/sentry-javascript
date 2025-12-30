import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction for dynamic route handlers', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handlers/[param]';
  });

  const response = await request.get('/route-handlers/foo');
  expect(await response.json()).toStrictEqual({ name: 'Beep' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should create a transaction for static route handlers', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handlers/static';
  });

  const response = await request.get('/route-handlers/static');
  expect(await response.json()).toStrictEqual({ name: 'Static' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should create a transaction for route handlers and correctly set span status depending on http status', async ({
  request,
}) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === 'POST /route-handlers/[param]';
  });

  const response = await request.post('/route-handlers/bar');
  expect(await response.json()).toStrictEqual({ name: 'Boop' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('invalid_argument');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should record exceptions and transactions for faulty route handlers', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-turbo', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Dynamic route handler error';
  });

  const routehandlerTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handlers/[param]/error';
  });

  await request.get('/route-handlers/boop/error').catch(() => {});

  const routehandlerTransaction = await routehandlerTransactionPromise;
  const routehandlerError = await errorEventPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('internal_error');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
  expect(routehandlerTransaction.contexts?.trace?.origin).toContain('auto');

  expect(routehandlerError.exception?.values?.[0].value).toBe('Dynamic route handler error');

  expect(routehandlerError.request?.method).toBe('GET');
  expect(routehandlerError.request?.url).toContain('/route-handlers/boop/error');

  expect(routehandlerError.transaction).toBe('/route-handlers/[param]/error');
});
