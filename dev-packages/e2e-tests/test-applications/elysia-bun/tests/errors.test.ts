import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Captures an error thrown in a route handler', async ({ baseURL, request }) => {
  const errorEventPromise = waitForError('elysia-bun', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  await request.get(`${baseURL}/test-exception/123`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  const exception = errorEvent.exception?.values?.[0];
  expect(exception?.value).toBe('This is an exception with id 123');
  expect(exception?.mechanism).toEqual({
    type: 'auto.http.elysia.on_error',
    handled: false,
  });

  expect(errorEvent.transaction).toEqual('GET /test-exception/:id');

  expect(errorEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
    }),
  );
});

test('Error event includes request metadata', async ({ baseURL, request }) => {
  const errorEventPromise = waitForError('elysia-bun', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 456';
  });

  await request.get(`${baseURL}/test-exception/456`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.request).toEqual(
    expect.objectContaining({
      method: 'GET',
      url: expect.stringContaining('/test-exception/456'),
      headers: expect.any(Object),
    }),
  );
});

test('Does not capture errors for 4xx responses', async ({ baseURL, request }) => {
  const transactionPromise = waitForTransaction('elysia-bun', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-4xx';
  });

  const response = await request.get(`${baseURL}/test-4xx`);
  // Wait for the transaction to ensure the request was processed
  await transactionPromise;

  expect(response.status()).toBe(400);
});

test('Captures errors even when status is <= 299 in error handler', async ({ baseURL, request }) => {
  const errorEventPromise = waitForError('elysia-bun', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Error with 200 status';
  });

  await request.get(`${baseURL}/test-error-with-200-status`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('Error with 200 status');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    type: 'auto.http.elysia.on_error',
    handled: false,
  });
});

test('Captures POST route errors', async ({ baseURL, request }) => {
  const errorEventPromise = waitForError('elysia-bun', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Post error';
  });

  await request.post(`${baseURL}/test-post-error`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('Post error');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    type: 'auto.http.elysia.on_error',
    handled: false,
  });
});

test('Captures thrown string errors', async ({ baseURL, request }) => {
  const errorEventPromise = waitForError('elysia-bun', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'String error message';
  });

  await request.get(`${baseURL}/test-string-error`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('String error message');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
    expect.objectContaining({
      type: 'auto.http.elysia.on_error',
      handled: false,
    }),
  );
});
