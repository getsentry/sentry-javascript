import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends exception to Sentry', async ({ baseURL }) => {
  console.log('Start test 1');
  const errorEventPromise = waitForError('nestjs', event => {
    console.log(event);
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const response = await fetch(`${baseURL}/test-exception/123`);
  expect(response.status).toBe(500);

  console.log('Waiting for error');

  const errorEvent = await errorEventPromise;

  console.log('Error found');

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an exception with id 123');

  console.log('Waiting for error');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-exception/123',
  });

  expect(errorEvent.transaction).toEqual('GET /test-exception/:id');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});

test('Does not send expected exception to Sentry', async ({ baseURL }) => {
  console.log('Start test 2');
  let errorEventOccurred = false;

  waitForError('nestjs', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an expected exception with id 123') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /test-expected-exception/:id';
  });

  const transactionEventPromise = waitForTransaction('nestjs', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-expected-exception/:id';
  });

  const response = await fetch(`${baseURL}/test-expected-exception/123`);
  expect(response.status).toBe(403);

  await transactionEventPromise;

  await new Promise(resolve => setTimeout(resolve, 10000));

  expect(errorEventOccurred).toBe(false);
});

test('Does not handle expected exception if exception is thrown in module', async ({ baseURL }) => {
  console.log('Start test 3');
  const errorEventPromise = waitForError('nestjs', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Something went wrong in the test module!';
  });

  const response = await fetch(`${baseURL}/test-module`);
  expect(response.status).toBe(500); // should be 400

  // should never arrive, but does because the exception is not handled properly
  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Something went wrong in the test module!');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-module',
  });

  expect(errorEvent.transaction).toEqual('GET /test-module');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});
