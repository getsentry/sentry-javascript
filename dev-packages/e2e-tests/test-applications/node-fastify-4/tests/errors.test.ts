import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-fastify-4', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  await fetch(`${baseURL}/test-exception/123`);

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

test('Does not send 4xx errors by default', async ({ baseURL }) => {
  // Define our test approach: we'll send both a 5xx and a 4xx request
  // We should only see the 5xx error captured due to shouldHandleError's default behavior

  // Create a promise to wait for the 500 error
  const serverErrorPromise = waitForError('node-fastify-4', event => {
    // Looking for a 500 error that should be captured
    return !!event.exception?.values?.[0]?.value?.includes('This is a 5xx error');
  });

  // Make a request that will trigger a 400 error
  const notFoundResponse = await fetch(`${baseURL}/test-4xx-error`);
  expect(notFoundResponse.status).toBe(400);

  // Make a request that will trigger a 500 error
  await fetch(`${baseURL}/test-5xx-error`);

  // Verify we receive the 500 error
  const errorEvent = await serverErrorPromise;
  expect(errorEvent.exception?.values?.[0]?.value).toContain('This is a 5xx error');
});

test('Does not send error when shouldHandleError returns false', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-fastify-4', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an error that will not be captured';
  });

  errorEventPromise.then(() => {
    throw new Error('This error should not be captured');
  });

  await fetch(`${baseURL}/test-error-not-captured`);

  // wait for a short time to ensure the error is not captured
  await new Promise(resolve => setTimeout(resolve, 1000));
});
