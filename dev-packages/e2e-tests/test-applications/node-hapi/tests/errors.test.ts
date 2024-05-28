import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/event-proxy-server';

test('Sends thrown error to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error';
  });

  await fetch(`${baseURL}/test-failure`);

  const errorEvent = await errorEventPromise;
  const errorEventId = errorEvent.event_id;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an error');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-failure',
  });

  expect(errorEvent.transaction).toEqual('GET /test-failure');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});

test('sends error with parameterized transaction name', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error with id 123';
  });

  await fetch(`${baseURL}/test-error/123`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent?.transaction).toBe('GET /test-error/{id}');
});
