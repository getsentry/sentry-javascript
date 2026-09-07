import { expect, test } from '@playwright/test';
import { waitForError, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const segmentEventPromise = collectStreamedSpansUntilSegment('node-express', 'GET /test-exception/:id');

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
    type: 'auto.http.express',
    handled: false,
  });

  expect(errorEvent.request).toMatchObject({
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

  // The error is attached to the same trace as the request segment, and to a
  // span in that segment.
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

test('Should record caught exceptions with local variable', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express', event => {
    return event.transaction === 'GET /test-local-variables-caught';
  });

  await fetch(`${baseURL}/test-local-variables-caught`);

  const errorEvent = await errorEventPromise;

  const frames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;
  expect(frames?.[frames.length - 1]?.vars?.randomVariableToRecord).toBeDefined();
});

test('To not crash app from withMonitor', async ({ baseURL }) => {
  const doRequest = async (id: number) => {
    const response = await fetch(`${baseURL}/crash-in-with-monitor/${id}`);
    return response.json();
  };
  const [response1, response2] = await Promise.all([doRequest(1), doRequest(2)]);
  expect(response1.message).toBe('This is an exception withMonitor: 1');
  expect(response2.message).toBe('This is an exception withMonitor: 2');
  expect(response1.pid).toBe(response2.pid); //Just to double-check, TBS
});
