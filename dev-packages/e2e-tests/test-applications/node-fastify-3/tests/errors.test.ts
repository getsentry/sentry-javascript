import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-fastify-3', event => {
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

test('Does not send error when shouldHandleError returns false', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-fastify-3', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an error that will not be captured';
  });

  errorEventPromise.then(() => {
    throw new Error('This error should not be captured');
  });

  await fetch(`${baseURL}/test-error-not-captured`);

  // wait for a short time to ensure the error is not captured
  await new Promise(resolve => setTimeout(resolve, 1000));
});
