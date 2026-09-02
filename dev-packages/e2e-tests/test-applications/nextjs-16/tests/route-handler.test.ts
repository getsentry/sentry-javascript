import test, { expect } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { isTurbopackDevMode } from './isDevMode';

test('Should create a span for node route handlers', async ({ request }) => {
  test.skip(isTurbopackDevMode, 'Turbopack intermittently returns 404 for dynamic routes in dev mode');

  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /route-handler/[xoxo]/node' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/node', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Node Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(routehandlerSpan.attributes['http.request.header.x_charly']?.value).toBe('gomez');
});

test('Should create a span for edge route handlers', async ({ request }) => {
  // This test only works for webpack builds on non-async param extraction
  // todo: check if we can set request headers for edge on sdkProcessingMetadata
  test.skip();
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /route-handler/[xoxo]/edge' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/edge', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Edge Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(routehandlerSpan.attributes['http.request.header.x_charly']?.value).toBe('gomez');
});

test('Should report an error with a parameterized span name for a throwing route handler', async ({ request }) => {
  test.skip(isTurbopackDevMode, 'Turbopack intermittently returns 404 for dynamic routes in dev mode');

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'route-handler-error') ?? false;
  });

  // Matched on the error's own trace so a span from an earlier spec cannot satisfy the correlation.
  const spanPromise = waitForStreamedSpan('nextjs-16', async span => {
    return (
      span.name === 'GET /route-handler/[xoxo]/error' &&
      span.is_segment &&
      getSpanOp(span) === 'http.server' &&
      (await errorEventPromise).contexts?.trace?.trace_id === span.trace_id
    );
  });

  request.get('/route-handler/456/error').catch(() => {});

  const errorEvent = await errorEventPromise;
  const span = await spanPromise;

  // Error should carry the parameterized transaction name
  expect(errorEvent.transaction).toBe('GET /route-handler/[xoxo]/error');

  // Span should have parameterized name and an error status
  expect(span.name).toBe('GET /route-handler/[xoxo]/error');
  expect(span.status).toBe('error');
});

test('Should set a parameterized transaction name on a captureMessage event in a route handler', async ({
  request,
}) => {
  test.skip(isTurbopackDevMode, 'Turbopack intermittently returns 404 for dynamic routes in dev mode');

  const messageEventPromise = waitForError('nextjs-16', event => {
    return event?.message === 'route-handler-message';
  });

  const spanPromise = waitForStreamedSpan('nextjs-16', async span => {
    return (
      span.name === 'GET /route-handler/[xoxo]/capture-message' &&
      span.is_segment &&
      getSpanOp(span) === 'http.server' &&
      (await messageEventPromise).contexts?.trace?.trace_id === span.trace_id
    );
  });

  const response = await request.get('/route-handler/789/capture-message');
  expect(await response.json()).toStrictEqual({ message: 'Message captured' });

  const messageEvent = await messageEventPromise;
  const span = await spanPromise;

  // Message should carry the parameterized transaction name
  expect(messageEvent.transaction).toBe('GET /route-handler/[xoxo]/capture-message');

  // Span should have parameterized name and ok status
  expect(span.name).toBe('GET /route-handler/[xoxo]/capture-message');
  expect(span.status).toBe('ok');
});

test('Should set a parameterized transaction name on a captureException event in a route handler', async ({
  request,
}) => {
  test.skip(isTurbopackDevMode, 'Turbopack intermittently returns 404 for dynamic routes in dev mode');

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'route-handler-capture-exception') ?? false;
  });

  const spanPromise = waitForStreamedSpan('nextjs-16', async span => {
    return (
      span.name === 'GET /route-handler/[xoxo]/capture-exception' &&
      span.is_segment &&
      getSpanOp(span) === 'http.server' &&
      (await errorEventPromise).contexts?.trace?.trace_id === span.trace_id
    );
  });

  const response = await request.get('/route-handler/321/capture-exception');
  expect(await response.json()).toStrictEqual({ message: 'Exception captured' });

  const errorEvent = await errorEventPromise;
  const span = await spanPromise;

  // Manually captured exception should carry the parameterized transaction name
  expect(errorEvent.transaction).toBe('GET /route-handler/[xoxo]/capture-exception');

  // Span should have parameterized name and ok status (error was caught, not thrown)
  expect(span.name).toBe('GET /route-handler/[xoxo]/capture-exception');
  expect(span.status).toBe('ok');
});
