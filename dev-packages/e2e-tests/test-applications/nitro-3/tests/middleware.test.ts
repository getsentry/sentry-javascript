import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Creates middleware spans for requests', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', event => {
    return event?.transaction === 'GET /api/test-transaction';
  });

  const response = await request.get('/api/test-transaction');

  expect(response.headers()['x-sentry-test-middleware']).toBe('executed');

  const transactionEvent = await transactionEventPromise;

  // h3 middleware spans have origin auto.http.nitro.h3 and op middleware.nitro
  const h3MiddlewareSpans = transactionEvent.spans?.filter(
    span => span.origin === 'auto.http.nitro.h3' && span.op === 'middleware.nitro',
  );
  expect(h3MiddlewareSpans?.length).toBeGreaterThanOrEqual(1);
});
