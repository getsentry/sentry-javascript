import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends unexpected exception to Sentry if thrown in module with global filter', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-with-submodules-decorator', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an uncaught exception!';
  });

  const response = await fetch(`${baseURL}/example-module/unexpected-exception`);
  const responseBody = await response.json();

  expect(response.status).toBe(501);
  expect(responseBody).toEqual({
    statusCode: 501,
    timestamp: expect.any(String),
    path: '/example-module/unexpected-exception',
    message: 'Example exception was handled by global filter!',
  });

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

test('Sends unexpected exception to Sentry if thrown in module that was registered before Sentry', async ({
  baseURL,
}) => {
  const errorEventPromise = waitForError('nestjs-with-submodules-decorator', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an uncaught exception!';
  });

  const response = await fetch(`${baseURL}/example-module-registered-first/unexpected-exception`);
  const responseBody = await response.json();

  expect(response.status).toBe(501);
  expect(responseBody).toEqual({
    statusCode: 501,
    timestamp: expect.any(String),
    path: '/example-module-registered-first/unexpected-exception',
    message: 'Example exception was handled by global filter!',
  });

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

  waitForError('nestjs-with-submodules-decorator', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Something went wrong in the example module!') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-module/expected-exception';
  });

  const transactionEventPromise = waitForTransaction('nestjs-with-submodules-decorator', transactionEvent => {
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

  waitForError('nestjs-with-submodules-decorator', event => {
    if (
      !event.type &&
      event.exception?.values?.[0]?.value === 'Something went wrong in the example module with local filter!'
    ) {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-module-local-filter/expected-exception';
  });

  const transactionEventPromise = waitForTransaction('nestjs-with-submodules-decorator', transactionEvent => {
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

  waitForError('nestjs-with-submodules-decorator', event => {
    if (!event.type && event.exception?.values?.[0].value === 'Something went wrong in the example module!') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-module-registered-first/expected-exception';
  });

  const transactionEventPromise = waitForTransaction('nestjs-with-submodules-decorator', transactionEvent => {
    return transactionEvent?.transaction === 'GET /example-module-registered-first/expected-exception';
  });

  const response = await fetch(`${baseURL}/example-module-registered-first/expected-exception`);
  expect(response.status).toBe(400);

  await transactionEventPromise;

  (await fetch(`${baseURL}/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});
