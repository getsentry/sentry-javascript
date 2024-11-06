import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-otel-without-tracing', event => {
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

  // This is unparameterized here because we do not have the express instrumentation
  expect(errorEvent.transaction).toEqual('GET /test-exception/123');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});

test('Isolates requests correctly', async ({ baseURL }) => {
  const errorEventPromise1 = waitForError('node-otel-without-tracing', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 555-a';
  });
  const errorEventPromise2 = waitForError('node-otel-without-tracing', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 555-b';
  });

  fetch(`${baseURL}/test-exception/555-a`);
  fetch(`${baseURL}/test-exception/555-b`);

  const errorEvent1 = await errorEventPromise1;
  const errorEvent2 = await errorEventPromise2;

  expect(errorEvent1.transaction).toEqual('GET /test-exception/555-a');
  expect(errorEvent1.tags).toEqual({ 'root-level-tag': 'yes', 'param-555-a': '555-a' });

  expect(errorEvent2.transaction).toEqual('GET /test-exception/555-b');
  expect(errorEvent2.tags).toEqual({ 'root-level-tag': 'yes', 'param-555-b': '555-b' });
});
