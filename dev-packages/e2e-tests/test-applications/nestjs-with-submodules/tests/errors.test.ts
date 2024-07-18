import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Does not handle expected exception if exception is thrown in module', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Something went wrong in the example module!';
  });

  const response = await fetch(`${baseURL}/example-module`);
  expect(response.status).toBe(500); // should be 400

  // should never arrive, but does because the exception is not handled properly
  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Something went wrong in the example module!');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/example-module',
  });

  expect(errorEvent.transaction).toEqual('GET /example-module');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});
