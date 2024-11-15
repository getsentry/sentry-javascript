import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Transaction includes span and correct value for decorated async function', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs-8', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-span-decorator-async'
    );
  });

  const response = await fetch(`${baseURL}/test-span-decorator-async`);
  const body = await response.json();

  expect(body.result).toEqual('test');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        span_id: expect.any(String),
        trace_id: expect.any(String),
        data: {
          'sentry.origin': 'manual',
          'sentry.op': 'wait and return a string',
        },
        description: 'wait',
        parent_span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        op: 'wait and return a string',
        origin: 'manual',
      }),
    ]),
  );
});

test('Transaction includes span and correct value for decorated sync function', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs-8', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-span-decorator-sync'
    );
  });

  const response = await fetch(`${baseURL}/test-span-decorator-sync`);
  const body = await response.json();

  expect(body.result).toEqual('test');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        span_id: expect.any(String),
        trace_id: expect.any(String),
        data: {
          'sentry.origin': 'manual',
          'sentry.op': 'return a string',
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

test('preserves original function name on decorated functions', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-function-name`);
  const body = await response.json();

  expect(body.result).toEqual('getFunctionName');
});
