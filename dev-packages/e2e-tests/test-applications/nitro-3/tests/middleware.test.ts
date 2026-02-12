import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

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

test('Captures errors thrown in middleware with error status on span', async ({ request }) => {
  const errorEventPromise = waitForError('nitro-3', event => {
    return !event.type && !!event.exception?.values?.some(v => v.value === 'Middleware error');
  });

  const transactionEventPromise = waitForTransaction('nitro-3', event => {
    return event?.transaction === 'GET /api/test-transaction' && event?.contexts?.trace?.status === 'internal_error';
  });

  await request.get('/api/test-transaction?middleware-error=1');

  const errorEvent = await errorEventPromise;
  expect(errorEvent.exception?.values?.some(v => v.value === 'Middleware error')).toBe(true);

  const transactionEvent = await transactionEventPromise;

  // The transaction span should have error status
  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');
});
