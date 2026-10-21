import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-fastify-6', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const segmentEventPromise = collectStreamedSpansUntilSegment('node-fastify-6', 'GET /test-exception/:id');

  await fetch(`${baseURL}/test-exception/123`);

  const errorEvent = await errorEventPromise;
  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && segment.name === 'GET /test-exception/:id',
  )!;

  expect(errorEvent.exception?.values).toHaveLength(1);
  const exception = errorEvent.exception?.values?.[0];
  expect(exception?.value).toBe('This is an exception with id 123');
  expect(exception?.mechanism).toEqual({
    type: 'auto.function.fastify',
    handled: false,
  });

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

  // The error belongs to the request segment's trace and one of its spans
  const segmentTrace = segmentEvent;
  expect(errorEvent.contexts?.trace?.trace_id).toBe(segmentTrace?.trace_id);

  const segmentSpanIds = [
    segmentTrace?.span_id,
    ...segmentEventSpans
      .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id)
      .map(span => span.span_id),
  ];
  expect(segmentSpanIds).toContain(errorEvent.contexts?.trace?.span_id);
});

test('Does not send error when shouldHandleError returns false', async ({ baseURL }) => {
  let errorEventOccurred = false;

  waitForError('node-fastify-6', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an error that will not be captured') {
      errorEventOccurred = true;
    }
    return event?.transaction === 'GET /test-error-not-captured';
  });

  const segmentEventPromise = waitForStreamedSpan(
    'node-fastify-6',
    segment => segment.is_segment && segment.name === 'GET /test-error-not-captured',
  );

  const response = await fetch(`${baseURL}/test-error-not-captured`);

  await segmentEventPromise;

  const flushResponse = await fetch(`${baseURL}/flush`);

  expect(response.status).toBe(500);
  expect(flushResponse.status).toBe(200);
  expect(errorEventOccurred).toBe(false);
});

// Regression test for https://github.com/fastify/fastify/issues/6409 (fixed in Fastify 5.7.0)
test('Error in child plugin with rethrown error handler reports correct 500 status', async ({ baseURL }) => {
  let errorEventOccurred = false;

  waitForError('node-fastify-6', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an error that will not be captured') {
      errorEventOccurred = true;
    }
    return event?.transaction === 'GET /test-error-ignored';
  });

  const segmentEventPromise = waitForStreamedSpan(
    'node-fastify-6',
    segment => segment.is_segment && segment.name === 'GET /test-error-ignored',
  );

  const response = await fetch(`${baseURL}/test-error-ignored`);

  await segmentEventPromise;

  const flushResponse = await fetch(`${baseURL}/flush`);

  expect(response.status).toBe(500);
  expect(flushResponse.status).toBe(200);
  expect(errorEventOccurred).toBe(false);
});
