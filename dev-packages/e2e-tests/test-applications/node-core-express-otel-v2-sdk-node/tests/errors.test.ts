import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-core-express-otel-v2-sdk-node', event => {
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

test('Errors do not leak between requests', async ({ baseURL }) => {
  // Set up promises to capture errors for both requests
  const firstErrorPromise = waitForError('node-core-express-otel-v2-sdk-node', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 111';
  });

  const secondErrorPromise = waitForError('node-core-express-otel-v2-sdk-node', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 222';
  });

  // Make first error request
  await fetch(`${baseURL}/test-exception/111`);

  // Make second error request
  await fetch(`${baseURL}/test-exception/222`);

  // Wait for both error events to be captured
  const [firstError, secondError] = await Promise.all([firstErrorPromise, secondErrorPromise]);

  // Verify first error has correct data and doesn't contain data from second error
  expect(firstError.exception?.values?.[0]?.value).toBe('This is an exception with id 111');
  expect(firstError.transaction).toEqual('GET /test-exception/111');
  expect(firstError.request?.url).toBe('http://localhost:3030/test-exception/111');

  // Verify second error has correct data and doesn't contain data from first error
  expect(secondError.exception?.values?.[0]?.value).toBe('This is an exception with id 222');
  expect(secondError.transaction).toEqual('GET /test-exception/222');
  expect(secondError.request?.url).toBe('http://localhost:3030/test-exception/222');

  // Verify errors have different trace contexts (no leakage)
  expect(firstError.contexts?.trace?.trace_id).not.toEqual(secondError.contexts?.trace?.trace_id);
  expect(firstError.contexts?.trace?.span_id).not.toEqual(secondError.contexts?.trace?.span_id);
});
