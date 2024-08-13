import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends unexpected exception to Sentry if thrown in module with global filter', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-with-submodules', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an uncaught exception!';
  });

  const response = await fetch(`${baseURL}/example-module/unexpected-exception`);
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an uncaught exception!');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/example-module/unexpected-exception',
  });

  expect(errorEvent.transaction).toEqual('GET /example-module/unexpected-exception');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});

test('Sends unexpected exception to Sentry if thrown in module with local filter', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-with-submodules', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an uncaught exception!';
  });

  const response = await fetch(`${baseURL}/example-module-local-filter/unexpected-exception`);
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an uncaught exception!');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/example-module-local-filter/unexpected-exception',
  });

  expect(errorEvent.transaction).toEqual('GET /example-module-local-filter/unexpected-exception');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});

test('Sends unexpected exception to Sentry if thrown in module that was registered before Sentry', async ({
  baseURL,
}) => {
  const errorEventPromise = waitForError('nestjs-with-submodules', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an uncaught exception!';
  });

  const response = await fetch(`${baseURL}/example-module-registered-first/unexpected-exception`);
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an uncaught exception!');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/example-module-registered-first/unexpected-exception',
  });

  expect(errorEvent.transaction).toEqual('GET /example-module-registered-first/unexpected-exception');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});

test('Does not send exception to Sentry if user-defined global exception filter already catches the exception', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('nestjs-with-submodules', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Something went wrong in the example module!') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-module/expected-exception';
  });

  const transactionEventPromise = waitForTransaction('nestjs-with-submodules', transactionEvent => {
    return transactionEvent?.transaction === 'GET /example-module/expected-exception';
  });

  const response = await fetch(`${baseURL}/example-module/expected-exception`);
  expect(response.status).toBe(400);

  await transactionEventPromise;

  (await fetch(`${baseURL}/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});

test('Does not send exception to Sentry if user-defined local exception filter already catches the exception', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('nestjs-with-submodules', event => {
    if (
      !event.type &&
      event.exception?.values?.[0]?.value === 'Something went wrong in the example module with local filter!'
    ) {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-module-local-filter/expected-exception';
  });

  const transactionEventPromise = waitForTransaction('nestjs-with-submodules', transactionEvent => {
    return transactionEvent?.transaction === 'GET /example-module-local-filter/expected-exception';
  });

  const response = await fetch(`${baseURL}/example-module-local-filter/expected-exception`);
  expect(response.status).toBe(400);

  await transactionEventPromise;

  (await fetch(`${baseURL}/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});

test('Does not send expected exception to Sentry if exception is thrown in module registered before Sentry', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('nestjs-with-submodules', event => {
    if (!event.type && event.exception?.values?.[0].value === 'Something went wrong in the example module!') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-module-registered-first/expected-exception';
  });

  const transactionEventPromise = waitForTransaction('nestjs-with-submodules', transactionEvent => {
    return transactionEvent?.transaction === 'GET /example-module-registered-first/expected-exception';
  });

  const response = await fetch(`${baseURL}/example-module-registered-first/expected-exception`);
  expect(response.status).toBe(400);

  await transactionEventPromise;

  (await fetch(`${baseURL}/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});
