import { expect, test } from '@playwright/test';
import { collectStreamedSpans, waitForError } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express-streaming', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  // In streaming mode there is no transaction event; the request's spans are streamed individually.
  // The root segment span flushes last, so collecting until it arrives captures the whole trace.
  const spansPromise = collectStreamedSpans('node-express-streaming', spans =>
    spans.some(span => span.name === 'GET /test-exception/:id' && span.is_segment),
  );

  await fetch(`${baseURL}/test-exception/123`);

  const errorEvent = await errorEventPromise;
  const spans = await spansPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  const exception = errorEvent.exception?.values?.[0];
  expect(exception?.value).toBe('This is an exception with id 123');
  expect(exception?.mechanism).toEqual({
    type: 'auto.middleware.express',
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
  });

  // The error is attached to the same trace as the streamed request spans, and to a
  // span that belongs to that trace (its root segment span or one of its children).
  const rootSpan = spans.find(span => span.name === 'GET /test-exception/:id' && span.is_segment);
  expect(errorEvent.contexts?.trace?.trace_id).toBe(rootSpan?.trace_id);

  const spanIds = spans.map(span => span.span_id);
  expect(spanIds).toContain(errorEvent.contexts?.trace?.span_id);
});

test('Should record caught exceptions with local variable', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express-streaming', event => {
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
  expect(response1.pid).toBe(response2.pid);
});
