import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction event for a successful route', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', transactionEvent => {
    return transactionEvent?.transaction === 'GET /api/test-transaction';
  });

  await request.get('/api/test-transaction');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /api/test-transaction',
      type: 'transaction',
    }),
  );

  // srvx.request creates a span for the request
  const srvxSpans = transactionEvent.spans?.filter(span => span.origin === 'auto.http.nitro.srvx');
  expect(srvxSpans?.length).toBeGreaterThanOrEqual(1);

  // h3 creates a child span for the route handler
  const h3Spans = transactionEvent.spans?.filter(span => span.origin === 'auto.http.nitro.h3');
  expect(h3Spans?.length).toBeGreaterThanOrEqual(1);
});

test('Sets correct HTTP status code on transaction', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', transactionEvent => {
    return transactionEvent?.transaction === 'GET /api/test-transaction';
  });

  await request.get('/api/test-transaction');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'http.response.status_code': 200,
    }),
  );

  expect(transactionEvent.contexts?.trace?.status).toBe('ok');
});

test('Uses parameterized route for transaction name', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', transactionEvent => {
    return transactionEvent?.transaction === 'GET /api/test-param/:id';
  });

  await request.get('/api/test-param/123');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /api/test-param/:id',
      transaction_info: expect.objectContaining({ source: 'route' }),
      type: 'transaction',
    }),
  );

  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'http.route': '/api/test-param/:id',
    }),
  );
});

test('Sets Server-Timing response headers for trace propagation', async ({ request }) => {
  const response = await request.get('/api/test-transaction');
  const headers = response.headers();

  expect(headers['server-timing']).toBeDefined();
  expect(headers['server-timing']).toContain('sentry-trace;desc="');
  expect(headers['server-timing']).toContain('baggage;desc="');
});
