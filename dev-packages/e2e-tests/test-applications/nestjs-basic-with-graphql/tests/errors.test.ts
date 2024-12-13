import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends exception to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-basic-with-graphql', event => {
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

  waitForError('nestjs-basic-with-graphql', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an expected 400 exception with id 123') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /test-expected-400-exception/:id';
  });

  waitForError('nestjs-basic-with-graphql', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an expected 500 exception with id 123') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /test-expected-500-exception/:id';
  });

  const transactionEventPromise400 = waitForTransaction('nestjs-basic-with-graphql', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-expected-400-exception/:id';
  });

  const transactionEventPromise500 = waitForTransaction('nestjs-basic-with-graphql', transactionEvent => {
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

test('Sends graphql exception to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-basic-with-graphql', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception!';
  });

  const response = await fetch(`${baseURL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query { error }`,
    }),
  });

  const json_response = await response.json();
  const errorEvent = await errorEventPromise;

  expect(json_response?.errors[0]).toEqual({
    message: 'This is an exception!',
    locations: expect.any(Array),
    path: ['error'],
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
      stacktrace: expect.any(Array),
    },
  });

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an exception!');

  expect(errorEvent.request).toEqual({
    method: 'POST',
    cookies: {},
    data: '{"query":"query { error }"}',
    headers: expect.any(Object),
    url: 'http://localhost:3030/graphql',
  });

  expect(errorEvent.transaction).toEqual('POST /graphql');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });
});
