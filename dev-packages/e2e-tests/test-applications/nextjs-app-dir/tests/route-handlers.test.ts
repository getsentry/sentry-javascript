import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should create a transaction for route handlers', async ({ request }) => {
  const routehandlerTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
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
  const routehandlerTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'POST /route-handlers/[param]';
  });

  const response = await request.post('/route-handlers/bar');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const routehandlerTransaction = await routehandlerTransactionPromise;

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('permission_denied');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
});

test('Should record exceptions and transactions for faulty route handlers', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'route-handler-error';
  });

  const routehandlerTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'PUT /route-handlers/[param]/error';
  });

  await request.put('/route-handlers/baz/error').catch(() => {
    // noop
  });

  const routehandlerTransaction = await routehandlerTransactionPromise;
  const routehandlerError = await errorEventPromise;

  // Assert that isolation scope works properly
  expect(routehandlerTransaction.tags?.['my-isolated-tag']).toBe(true);
  expect(routehandlerTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  expect(routehandlerError.tags?.['my-isolated-tag']).toBe(true);
  expect(routehandlerError.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  expect(routehandlerTransaction.contexts?.trace?.status).toBe('internal_error');
  expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
  expect(routehandlerTransaction.contexts?.trace?.origin).toContain('auto');

  expect(routehandlerError.exception?.values?.[0].value).toBe('route-handler-error');

  expect(routehandlerError.request?.method).toBe('PUT');
  expect(routehandlerError.request?.url).toContain('/route-handlers/baz/error');

  expect(routehandlerError.transaction).toBe('PUT /route-handlers/[param]/error');
});

test.describe('Edge runtime', () => {
  test('should create a transaction for route handlers', async ({ request }) => {
    const routehandlerTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
      return (
        transactionEvent?.transaction === 'PATCH /route-handlers/[param]/edge' &&
        transactionEvent.contexts?.runtime?.name === 'vercel-edge'
      );
    });

    const response = await request.patch('/route-handlers/bar/edge');
    expect(await response.json()).toStrictEqual({ name: 'John Doe' });

    const routehandlerTransaction = await routehandlerTransactionPromise;

    expect(routehandlerTransaction.contexts?.trace?.status).toBe('unauthenticated');
    expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');
  });

  test('should record exceptions and transactions for faulty route handlers', async ({ request }) => {
    const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
      return (
        errorEvent?.exception?.values?.[0]?.value === 'route-handler-edge-error' &&
        errorEvent.contexts?.runtime?.name === 'vercel-edge'
      );
    });

    const routehandlerTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
      return (
        transactionEvent?.transaction === 'DELETE /route-handlers/[param]/edge' &&
        transactionEvent.contexts?.runtime?.name === 'vercel-edge'
      );
    });

    await request.delete('/route-handlers/baz/edge').catch(() => {
      // noop
    });

    const routehandlerTransaction = await routehandlerTransactionPromise;
    const routehandlerError = await errorEventPromise;

    // Assert that isolation scope works properly
    expect(routehandlerTransaction.tags?.['my-isolated-tag']).toBe(true);
    expect(routehandlerTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
    expect(routehandlerError.tags?.['my-isolated-tag']).toBe(true);
    expect(routehandlerError.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

    expect(routehandlerTransaction.contexts?.trace?.status).toBe('unknown_error');
    expect(routehandlerTransaction.contexts?.trace?.op).toBe('http.server');

    expect(routehandlerError.exception?.values?.[0].value).toBe('route-handler-edge-error');

    expect(routehandlerError.transaction).toBe('DELETE /route-handlers/[param]/edge');
  });

  test('should not create spans for outgoing Sentry requests on edge routes', async ({ request }) => {
    // Ensure no http.client transaction is created for any orphaned request
    waitForTransaction('nextjs-app-dir', async transactionEvent => {
      if (transactionEvent.contexts?.trace?.op === 'http.client') {
        throw new Error(`Should not receive http.client transaction, but got: ${transactionEvent.transaction}`);
      }
      return false;
    });

    // We hit the endpoint three times and check that nowhere a http.client span for Sentry is to be found
    // this way, we ensure that nothing is sent to Sentry in a follow up span
    const edgerouteTransactionPromise1 = waitForTransaction('nextjs-app-dir', async transactionEvent => {
      return (
        transactionEvent?.transaction === 'PATCH /route-handlers/[param]/edge' &&
        transactionEvent.contexts?.runtime?.name === 'vercel-edge'
      );
    });

    await request.patch('/route-handlers/bar/edge');

    const edgerouteTransactionPromise2 = waitForTransaction('nextjs-app-dir', async transactionEvent => {
      return (
        transactionEvent?.transaction === 'PATCH /route-handlers/[param]/edge' &&
        transactionEvent.contexts?.runtime?.name === 'vercel-edge'
      );
    });

    await request.patch('/route-handlers/bar/edge');

    const edgerouteTransactionPromise3 = waitForTransaction('nextjs-app-dir', async transactionEvent => {
      return (
        transactionEvent?.transaction === 'PATCH /route-handlers/[param]/edge' &&
        transactionEvent.contexts?.runtime?.name === 'vercel-edge'
      );
    });

    await request.patch('/route-handlers/bar/edge');

    const [edgerouteTransaction1, edgerouteTransaction2, edgerouteTransaction3] = await Promise.all([
      edgerouteTransactionPromise1,
      edgerouteTransactionPromise2,
      edgerouteTransactionPromise3,
    ]);

    expect(edgerouteTransaction1.contexts?.trace?.op).toBe('http.server');
    expect(edgerouteTransaction2.contexts?.trace?.op).toBe('http.server');
    expect(edgerouteTransaction3.contexts?.trace?.op).toBe('http.server');

    expect(edgerouteTransaction1.spans).toContainEqual({
      description: 'GET https://github.com/',
    });
    expect(edgerouteTransaction2.spans).toContainEqual({
      description: 'GET https://github.com/',
    });
    expect(edgerouteTransaction3.spans).toContainEqual({
      description: 'GET https://github.com/',
    });
    // Does not contain span that is sent to the event proxy server
    expect(edgerouteTransaction1.spans).not.toContainEqual({
      description: expect.stringContaining('https://localhost:3031'),
    });
    expect(edgerouteTransaction2.spans).not.toContainEqual({
      description: expect.stringContaining('https://localhost:3031'),
    });
    expect(edgerouteTransaction3.spans).not.toContainEqual({
      description: expect.stringContaining('https://localhost:3031'),
    });
  });
});

test('should not crash route handlers that are configured with `export const dynamic = "error"`', async ({
  request,
}) => {
  const response = await request.get('/route-handlers/static');
  expect(await response.json()).toStrictEqual({ result: 'static response' });
});
