import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Transaction includes span for decorated async function', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-span-decorator-async'
    );
  });

  await fetch(`${baseURL}/test-span-decorator-async`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        span_id: expect.any(String),
        trace_id: expect.any(String),
        data: {
          'sentry.origin': 'manual',
          'sentry.op': 'wait function',
          'otel.kind': 'INTERNAL',
        },
        description: 'wait',
        parent_span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        op: 'wait function',
        origin: 'manual',
      }),
    ]),
  );
});

test('Transaction includes span and correct value for decorated sync function', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-span-decorator-sync'
    );
  });

  const response = await fetch(`${baseURL}/test-span-decorator-sync`);
  const body = await response.json();

  expect(body.result).toEqual('test');

  const transactionEvent = await transactionEventPromise;

  console.log(transactionEvent);

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        span_id: expect.any(String),
        trace_id: expect.any(String),
        data: {
          'sentry.origin': 'manual',
          'sentry.op': 'return a string',
          'otel.kind': 'INTERNAL',
        },
        description: 'getString',
        parent_span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        op: 'return a string',
        origin: 'manual',
      }),
    ]),
  );
});

