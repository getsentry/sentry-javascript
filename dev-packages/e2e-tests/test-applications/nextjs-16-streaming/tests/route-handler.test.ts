import test, { expect } from '@playwright/test';
import { waitForError, waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';

test('Should create a streamed span for node route handlers', async ({ request }) => {
  const rootSpanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === 'GET /route-handler/[xoxo]/node' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/node', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Node Route Handler' });

  const rootSpan = await rootSpanPromise;

  expect(rootSpan.status).toBe('ok');
  expect(getSpanOp(rootSpan)).toBe('http.server');
});

test('Should report an error linked to the correct trace for a throwing route handler', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-16-streaming', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'route-handler-error') ?? false;
  });

  const rootSpanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === 'GET /route-handler/[xoxo]/error' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  request.get('/route-handler/456/error').catch(() => {});

  const errorEvent = await errorEventPromise;
  const rootSpan = await rootSpanPromise;

  expect(errorEvent.contexts?.trace?.trace_id).toBe(rootSpan.trace_id);
  expect(errorEvent.transaction).toBe('GET /route-handler/[xoxo]/error');
  expect(rootSpan.status).toBe('error');
});

test('Should set a parameterized transaction name on a captureMessage event in a route handler', async ({
  request,
}) => {
  const messageEventPromise = waitForError('nextjs-16-streaming', event => {
    return event?.message === 'route-handler-message';
  });

  const rootSpanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return (
      span.name === 'GET /route-handler/[xoxo]/capture-message' && getSpanOp(span) === 'http.server' && span.is_segment
    );
  });

  const response = await request.get('/route-handler/789/capture-message');
  expect(await response.json()).toStrictEqual({ message: 'Message captured' });

  const messageEvent = await messageEventPromise;
  const rootSpan = await rootSpanPromise;

  expect(messageEvent.contexts?.trace?.trace_id).toBe(rootSpan.trace_id);
  expect(messageEvent.transaction).toBe('GET /route-handler/[xoxo]/capture-message');
  expect(rootSpan.status).toBe('ok');
});
