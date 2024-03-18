import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '../event-proxy-server';

test('Should create a transaction for route handlers', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /route-handlers/[param]';
  });

  const response = await request.get('/route-handlers/foo', { headers: { 'x-yeet': 'test-value' } });
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('ok');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
  expect(routehandlerTransaction.request?.headers?.['x-yeet']).toBe('test-value');
});

test('Should create a transaction for route handlers and correctly set span status depending on http status', async ({
  request,
}) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'POST /route-handlers/[param]';
  });

  const response = await request.post('/route-handlers/bar');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('not_found');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should record exceptions and transactions for faulty route handlers', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'route-handler-error';
  });

  const routehandlerTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'PUT /route-handlers/[param]/error';
  });

  await request.put('/route-handlers/baz/error').catch(() => {
    // noop
  });

  const routehandlerTransaction = await routehandlerTransactionPromise;
  const routehandlerError = await errorEventPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('internal_error');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');

  expect(routehandlerError.exception?.values?.[0].value).toBe('route-handler-error');
  // TODO: Uncomment once we update the scope transaction name on the server side
  // expect(routehandlerError.transaction).toBe('PUT /route-handlers/[param]/error');
});

test.describe('Edge runtime', () => {
  test('should create a transaction for route handlers', async ({ request }) => {
    const routehandlerTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
      return transactionEvent?.transaction === 'PATCH /route-handlers/[param]/edge';
    });

    const response = await request.patch('/route-handlers/bar/edge');
    expect(await response.json()).toStrictEqual({ name: 'John Doe' });

    const routehandlerTransaction = await routehandlerTransactionPromise;

    expect(routehandlerTransaction.contexts?.trace?.status).toBe('unauthenticated');
    expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
  });

  test('should record exceptions and transactions for faulty route handlers', async ({ request }) => {
    const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'route-handler-edge-error';
    });

    const routehandlerTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
      return transactionEvent?.transaction === 'DELETE /route-handlers/[param]/edge';
    });

    await request.delete('/route-handlers/baz/edge').catch(() => {
      // noop
    });

    const routehandlerTransaction = await routehandlerTransactionPromise;
    const routehandlerError = await errorEventPromise;

    expect(routehandlerTransaction.contexts?.trace?.status).toBe('internal_error');
    expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
    expect(routehandlerTransaction.contexts?.runtime?.name).toBe('vercel-edge');

    expect(routehandlerError.exception?.values?.[0].value).toBe('route-handler-edge-error');
    expect(routehandlerError.contexts?.runtime?.name).toBe('vercel-edge');
  });
});

test('should not crash route handlers that are configured with `export const dynamic = "error"`', async ({
  request,
}) => {
  const response = await request.get('/route-handlers/static');
  expect(await response.json()).toStrictEqual({ result: 'static response' });
});
