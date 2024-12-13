import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends exception to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-graphql', event => {
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
