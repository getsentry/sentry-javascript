import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-core-express-otel-v2', event => {
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

  expect(errorEvent.transaction).toEqual('GET /test-exception/123');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });
});

test('Should record caught exceptions with local variable', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-core-express-otel-v2', event => {
    return event.transaction === 'GET /test-local-variables-caught';
  });

  await fetch(`${baseURL}/test-local-variables-caught`);

  const errorEvent = await errorEventPromise;

  const frames = errorEvent.exception?.values?.[0].stacktrace?.frames;
  expect(frames?.[frames.length - 1].vars?.randomVariableToRecord).toBeDefined();
});
