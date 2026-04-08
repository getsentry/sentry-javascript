import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { isDevMode } from './isDevMode';

// TODO: Middleware tests need SDK adjustments for Cloudflare Workers edge runtime
test.skip('Should create a transaction for middleware', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-16-cf-workers', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.contexts?.trace?.status).toBe('ok');
  expect(middlewareTransaction.contexts?.trace?.op).toBe('http.server.middleware');
  expect(middlewareTransaction.contexts?.runtime?.name).toBe('vercel-edge');
  expect(middlewareTransaction.transaction_info?.source).toBe('route');

  // Assert that isolation scope works properly
  expect(middlewareTransaction.tags?.['my-isolated-tag']).toBe(true);
  // TODO: Isolation scope is not working properly yet
  // expect(middlewareTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});

// TODO: Middleware tests need SDK adjustments for Cloudflare Workers edge runtime
test.skip('Faulty middlewares', async ({ request }) => {
  test.skip(isDevMode, 'Throwing crashes the dev server atm'); // https://github.com/vercel/next.js/issues/85261
  const middlewareTransactionPromise = waitForTransaction('nextjs-16-cf-workers', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  const errorEventPromise = waitForError('nextjs-16-cf-workers', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Middleware Error';
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-throw': '1' } }).catch(() => {
    // Noop
  });

  await test.step('should record transactions', async () => {
    const middlewareTransaction = await middlewareTransactionPromise;
    expect(middlewareTransaction.contexts?.trace?.status).toBe('internal_error');
    expect(middlewareTransaction.contexts?.trace?.op).toBe('http.server.middleware');
    expect(middlewareTransaction.contexts?.runtime?.name).toBe('vercel-edge');
    expect(middlewareTransaction.transaction_info?.source).toBe('route');
  });
});

// TODO: Middleware tests need SDK adjustments for Cloudflare Workers edge runtime
test.skip('Should trace outgoing fetch requests inside middleware and create breadcrumbs for it', async ({
  request,
}) => {
  test.skip(isDevMode, 'The fetch requests ends up in a separate tx in dev atm');
  const middlewareTransactionPromise = waitForTransaction('nextjs-16-cf-workers', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  request.get('/api/endpoint-behind-middleware', { headers: { 'x-should-make-request': '1' } }).catch(() => {
    // Noop
  });

  const middlewareTransaction = await middlewareTransactionPromise;

  // Breadcrumbs should always be created for the fetch request
  expect(middlewareTransaction.breadcrumbs).toEqual(
    expect.arrayContaining([
      {
        category: 'http',
        data: { 'http.method': 'GET', status_code: 200, url: 'http://localhost:3030/' },
        timestamp: expect.any(Number),
        type: 'http',
      },
    ]),
  );
});
