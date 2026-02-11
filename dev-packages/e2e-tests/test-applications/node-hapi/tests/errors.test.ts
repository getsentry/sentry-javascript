import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends thrown error to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error';
  });

  const transactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure';
  });

  await fetch(`${baseURL}/test-failure`);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('GET /test-failure');
  expect(transactionEvent.contexts?.trace).toMatchObject({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });

  expect(errorEvent.exception?.values).toHaveLength(1);
  const exception = errorEvent.exception?.values?.[0];
  expect(exception?.value).toBe('This is an error');
  expect(exception?.mechanism).toEqual({
    type: 'auto.function.hapi',
    handled: false,
  });

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-failure',
  });

  expect(errorEvent.transaction).toEqual('GET /test-failure');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });

  expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);
  expect(errorEvent.contexts?.trace?.span_id).toBe(transactionEvent.contexts?.trace?.span_id);
});

test('sends error with parameterized transaction name', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error with id 123';
  });

  await fetch(`${baseURL}/test-error/123`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent?.transaction).toBe('GET /test-error/{id}');
});

test('Does not send errors to Sentry if boom throws in "onPreResponse" after JS error in route handler', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('node-hapi', event => {
    if (event.exception?.values?.[0]?.value?.includes('This is a JS error (boom in onPreResponse)')) {
      errorEventOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const transactionEventPromise4xx = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure-boom-4xx';
  });

  const transactionEventPromise5xx = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure-boom-5xx';
  });

  const response4xx = await fetch(`${baseURL}/test-failure-boom-4xx`);
  const response5xx = await fetch(`${baseURL}/test-failure-boom-5xx`);

  expect(response4xx.status).toBe(400);
  expect(response5xx.status).toBe(504);

  const transactionEvent4xx = await transactionEventPromise4xx;
  const transactionEvent5xx = await transactionEventPromise5xx;

  expect(errorEventOccurred).toBe(false);
  expect(transactionEvent4xx.transaction).toBe('GET /test-failure-boom-4xx');
  expect(transactionEvent5xx.transaction).toBe('GET /test-failure-boom-5xx');
});

test('Does not send error to Sentry if error response is overwritten with 2xx in "onPreResponse"', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('node-hapi', event => {
    if (event.exception?.values?.[0]?.value?.includes('This is a JS error (2xx override in onPreResponse)')) {
      errorEventOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const transactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure-2xx-override-onPreResponse';
  });

  const response = await fetch(`${baseURL}/test-failure-2xx-override-onPreResponse`);

  const transactionEvent = await transactionEventPromise;

  expect(response.status).toBe(200);
  expect(errorEventOccurred).toBe(false);
  expect(transactionEvent.transaction).toBe('GET /test-failure-2xx-override-onPreResponse');
});

test('Only sends onPreResponse error to Sentry if JS error is thrown in route handler AND onPreResponse', async ({
  baseURL,
}) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value?.includes('JS error (onPreResponse)') || false;
  });

  let routeHandlerErrorOccurred = false;

  waitForError('node-hapi', event => {
    if (
      !event.type &&
      event.exception?.values?.[0]?.value?.includes('This is an error (another JS error in onPreResponse)')
    ) {
      routeHandlerErrorOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const transactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-failure-JS-error-onPreResponse';
  });

  const response = await fetch(`${baseURL}/test-failure-JS-error-onPreResponse`);

  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionEventPromise;

  expect(routeHandlerErrorOccurred).toBe(false);
  expect(transactionEvent.transaction).toBe('GET /test-failure-JS-error-onPreResponse');
  expect(errorEvent.transaction).toEqual('GET /test-failure-JS-error-onPreResponse');
});
