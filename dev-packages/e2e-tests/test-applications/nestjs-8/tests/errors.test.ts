import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends exception to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-8', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const response = await fetch(`${baseURL}/test-exception/123`);
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an exception with id 123');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-exception/123',
  });

  expect(errorEvent.transaction).toEqual('GET /test-exception/:id');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });
});

test('Does not send HttpExceptions to Sentry', async ({ baseURL }) => {
  let errorEventOccurred = false;

  waitForError('nestjs-8', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an expected 400 exception with id 123') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /test-expected-400-exception/:id';
  });

  waitForError('nestjs-8', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an expected 500 exception with id 123') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /test-expected-500-exception/:id';
  });

  const transactionEventPromise400 = waitForTransaction('nestjs-8', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-expected-400-exception/:id';
  });

  const transactionEventPromise500 = waitForTransaction('nestjs-8', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-expected-500-exception/:id';
  });

  const response400 = await fetch(`${baseURL}/test-expected-400-exception/123`);
  expect(response400.status).toBe(400);

  const response500 = await fetch(`${baseURL}/test-expected-500-exception/123`);
  expect(response500.status).toBe(500);

  await transactionEventPromise400;
  await transactionEventPromise500;

  (await fetch(`${baseURL}/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});

test('Does not send RpcExceptions to Sentry', async ({ baseURL }) => {
  let errorEventOccurred = false;

  waitForError('nestjs-8', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an expected RPC exception with id 123') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /test-expected-rpc-exception/:id';
  });

  const transactionEventPromise = waitForTransaction('nestjs-8', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-expected-rpc-exception/:id';
  });

  const response = await fetch(`${baseURL}/test-expected-rpc-exception/123`);
  expect(response.status).toBe(500);

  await transactionEventPromise;

  (await fetch(`${baseURL}/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});

test('Global exception filter registered in main module is applied and exception is not sent to Sentry', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('nestjs-8', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Example exception was handled by global filter!') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-exception-global-filter';
  });

  const transactionEventPromise = waitForTransaction('nestjs-8', transactionEvent => {
    return transactionEvent?.transaction === 'GET /example-exception-global-filter';
  });

  const response = await fetch(`${baseURL}/example-exception-global-filter`);
  const responseBody = await response.json();

  expect(response.status).toBe(400);
  expect(responseBody).toEqual({
    statusCode: 400,
    timestamp: expect.any(String),
    path: '/example-exception-global-filter',
    message: 'Example exception was handled by global filter!',
  });

  await transactionEventPromise;

  (await fetch(`${baseURL}/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});

test('Local exception filter registered in main module is applied and exception is not sent to Sentry', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('nestjs-8', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Example exception was handled by local filter!') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-exception-local-filter';
  });

  const transactionEventPromise = waitForTransaction('nestjs-8', transactionEvent => {
    return transactionEvent?.transaction === 'GET /example-exception-local-filter';
  });

  const response = await fetch(`${baseURL}/example-exception-local-filter`);
  const responseBody = await response.json();

  expect(response.status).toBe(400);
  expect(responseBody).toEqual({
    statusCode: 400,
    timestamp: expect.any(String),
    path: '/example-exception-local-filter',
    message: 'Example exception was handled by local filter!',
  });

  await transactionEventPromise;

  (await fetch(`${baseURL}/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});
