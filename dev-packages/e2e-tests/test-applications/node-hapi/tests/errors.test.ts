import { expect, test } from '@playwright/test';
import {
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForError,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';

test('Sends thrown error to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error';
  });

  const spansPromise = collectStreamedSpansUntilSegment('node-hapi', 'GET /test-failure');

  await fetch(`${baseURL}/test-failure`);

  const errorEvent = await errorEventPromise;
  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment);

  expect(segmentSpan?.name).toBe('GET /test-failure');
  expect(segmentSpan).toMatchObject({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });

  expect(errorEvent.exception?.values).toHaveLength(1);
  const exception = errorEvent.exception?.values?.[0];
  expect(exception?.value).toBe('This is an error');
  expect(exception?.mechanism).toEqual({
    type: 'auto.function.hapi',
    handled: false,
  });

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-failure',
  });

  expect(errorEvent.transaction).toEqual('GET /test-failure');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });

  // The error is attributed to the route handler span that threw, which is a child of the request
  // span the segment is built from.
  const routeHandlerSpan = spans.find(span => getSpanOp(span) === 'router');
  expect(errorEvent.contexts?.trace?.trace_id).toBe(segmentSpan?.trace_id);
  expect(errorEvent.contexts?.trace?.span_id).toBe(routeHandlerSpan?.span_id);
  expect(errorEvent.contexts?.trace?.parent_span_id).toBe(segmentSpan?.span_id);
});

test('sends error with parameterized transaction name', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'This is an error with id 123';
  });

  await fetch(`${baseURL}/test-error/123`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent?.transaction).toBe('GET /test-error/{id}');
});

test('Does not send errors to Sentry if boom throws in "onPreResponse" after JS error in route handler', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('node-hapi', event => {
    if (event.exception?.values?.[0]?.value?.includes('This is a JS error (boom in onPreResponse)')) {
      errorEventOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const segmentEventPromise4xx = waitForStreamedSpan(
    'node-hapi',
    segment => segment.is_segment && segment.name === 'GET /test-failure-boom-4xx',
  );

  const segmentEventPromise5xx = waitForStreamedSpan(
    'node-hapi',
    segment => segment.is_segment && segment.name === 'GET /test-failure-boom-5xx',
  );

  const response4xx = await fetch(`${baseURL}/test-failure-boom-4xx`);
  const response5xx = await fetch(`${baseURL}/test-failure-boom-5xx`);

  expect(response4xx.status).toBe(400);
  expect(response5xx.status).toBe(504);

  const segmentEvent4xx = await segmentEventPromise4xx;
  const segmentEvent5xx = await segmentEventPromise5xx;

  expect(errorEventOccurred).toBe(false);
  expect(segmentEvent4xx.name).toBe('GET /test-failure-boom-4xx');
  expect(segmentEvent5xx.name).toBe('GET /test-failure-boom-5xx');
});

test('Does not send error to Sentry if error response is overwritten with 2xx in "onPreResponse"', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('node-hapi', event => {
    if (event.exception?.values?.[0]?.value?.includes('This is a JS error (2xx override in onPreResponse)')) {
      errorEventOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const segmentEventPromise = waitForStreamedSpan(
    'node-hapi',
    segment => segment.is_segment && segment.name === 'GET /test-failure-2xx-override-onPreResponse',
  );

  const response = await fetch(`${baseURL}/test-failure-2xx-override-onPreResponse`);

  const segmentEvent = await segmentEventPromise;

  expect(response.status).toBe(200);
  expect(errorEventOccurred).toBe(false);
  expect(segmentEvent.name).toBe('GET /test-failure-2xx-override-onPreResponse');
});

test('Only sends onPreResponse error to Sentry if JS error is thrown in route handler AND onPreResponse', async ({
  baseURL,
}) => {
  const errorEventPromise = waitForError('node-hapi', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value?.includes('JS error (onPreResponse)') || false;
  });

  let routeHandlerErrorOccurred = false;

  waitForError('node-hapi', event => {
    if (
      !event.type &&
      event.exception?.values?.[0]?.value?.includes('This is an error (another JS error in onPreResponse)')
    ) {
      routeHandlerErrorOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const segmentEventPromise = waitForStreamedSpan(
    'node-hapi',
    segment => segment.is_segment && segment.name === 'GET /test-failure-JS-error-onPreResponse',
  );

  const response = await fetch(`${baseURL}/test-failure-JS-error-onPreResponse`);

  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;
  const segmentEvent = await segmentEventPromise;

  expect(routeHandlerErrorOccurred).toBe(false);
  expect(segmentEvent.name).toBe('GET /test-failure-JS-error-onPreResponse');
  expect(errorEvent.transaction).toEqual('GET /test-failure-JS-error-onPreResponse');
});
