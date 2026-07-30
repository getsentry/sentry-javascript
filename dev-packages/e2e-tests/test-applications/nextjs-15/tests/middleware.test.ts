import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// The `tracesSampler` in `sentry.edge.config.ts` only samples `Middleware.execute` spans when `normalizedRequest`
// is available at sampling time, so this test times out if the request data does not reach the sampler.
test('tracesSampler receives normalizedRequest for edge middleware', async ({ request }) => {
  const middlewareTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return transactionEvent?.transaction === 'middleware GET';
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareTransaction = await middlewareTransactionPromise;

  expect(middlewareTransaction.contexts?.runtime?.name).toBe('vercel-edge');
  expect(middlewareTransaction.contexts?.trace?.op).toBe('middleware');
  expect(middlewareTransaction.request?.url).toContain('/api/endpoint-behind-middleware');
  expect(middlewareTransaction.request?.method).toBe('GET');
});

// The `tracesSampler` additionally asserts that `normalizedRequest.url` matches the sampled span's own
// `http.target`, so a request leaking into the sampling context of a concurrent one drops that transaction
// and times this test out.
test('does not leak normalizedRequest between concurrent middleware invocations', async ({ request }) => {
  const firstTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'middleware GET' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === '/api/endpoint-behind-middleware'
    );
  });

  const secondTransactionPromise = waitForTransaction('nextjs-15', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'middleware GET' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === '/api/endpoint-behind-middleware-2'
    );
  });

  await Promise.all([request.get('/api/endpoint-behind-middleware'), request.get('/api/endpoint-behind-middleware-2')]);

  const [firstTransaction, secondTransaction] = await Promise.all([firstTransactionPromise, secondTransactionPromise]);

  expect(firstTransaction.request?.url).toContain('/api/endpoint-behind-middleware');
  expect(firstTransaction.request?.url).not.toContain('/api/endpoint-behind-middleware-2');
  expect(secondTransaction.request?.url).toContain('/api/endpoint-behind-middleware-2');
});
