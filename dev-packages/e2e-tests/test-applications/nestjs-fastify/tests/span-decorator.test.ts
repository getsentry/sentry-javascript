import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Transaction includes span and correct value for decorated async function', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
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
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        data: {
          'sentry.origin': 'auto.function.nestjs.sentry_traced',
          'sentry.op': 'wait and return a string',
        },
        description: 'wait',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        op: 'wait and return a string',
        origin: 'auto.function.nestjs.sentry_traced',
      }),
    ]),
  );
});

test('Transaction includes span and correct value for decorated sync function', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
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
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        data: {
          'sentry.origin': 'auto.function.nestjs.sentry_traced',
          'sentry.op': 'return a string',
        },
        description: 'getString',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        op: 'return a string',
        origin: 'auto.function.nestjs.sentry_traced',
      }),
    ]),
  );
});

test('preserves original function name on decorated functions', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-function-name`);
  const body = await response.json();

  expect(body.result).toEqual('getFunctionName');
});
