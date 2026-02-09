import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction event for a successful route', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-transaction';
  });

  await request.get('/test-transaction');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /test-transaction',
      type: 'transaction',
    }),
  );

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      op: expect.stringContaining('http'),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    }),
  );
});

test('Sets correct HTTP status code on transaction', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-transaction';
  });

  await request.get('/test-transaction');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'http.response.status_code': 200,
    }),
  );

  expect(transactionEvent.contexts?.trace?.status).toBe('ok');
});

test('Sends a transaction event for a parameterized route', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-param/123';
  });

  await request.get('/test-param/123');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      type: 'transaction',
    }),
  );
});

test('Sets Server-Timing response headers for trace propagation', async ({ request }) => {
  const response = await request.get('/test-transaction');
  const headers = response.headers();

  expect(headers['server-timing']).toBeDefined();
  expect(headers['server-timing']).toContain('sentry-trace;desc="');
  expect(headers['server-timing']).toContain('baggage;desc="');
});
