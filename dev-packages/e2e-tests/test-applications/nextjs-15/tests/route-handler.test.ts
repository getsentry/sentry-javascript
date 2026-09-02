import test, { expect } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should create a span for node route handlers', async ({ request }) => {
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'GET /route-handler/[xoxo]/node' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/node', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Node Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');

  // This is flaking on dev mode
  if (process.env.TEST_ENV !== 'development' && process.env.TEST_ENV !== 'dev-turbopack') {
    expect(routehandlerSpan.attributes['http.request.header.x_charly']?.value).toBe('gomez');
  }
});

test('Should create a span for edge route handlers', async ({ request }) => {
  // This test only works for webpack builds on non-async param extraction
  // todo: check if we can set request headers for edge on sdkProcessingMetadata
  test.skip();
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'GET /route-handler/[xoxo]/edge' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/edge', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Edge Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(routehandlerSpan.attributes['http.request.header.x_charly']?.value).toBe('gomez');
});

test('Should create a span for static route handlers', async ({ request }) => {
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'GET /route-handler/static' && span.is_segment;
  });

  const response = await request.get('/route-handler/static');
  expect(await response.json()).toStrictEqual({ name: 'Static' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
});

test('Should create a span for route handlers and correctly set span status depending on http status', async ({
  request,
}) => {
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'POST /route-handler/[xoxo]/node' && span.is_segment;
  });

  const response = await request.post('/route-handler/123/node');
  expect(await response.json()).toStrictEqual({ name: 'Boop' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('error');
  expect(routehandlerSpan.attributes['sentry.status.message']?.value).toBe('invalid_argument');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
});

test('Should record exceptions and spans for faulty route handlers', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Route handler error';
  });

  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'GET /route-handler/[xoxo]/error' && span.is_segment;
  });

  await request.get('/route-handler/123/error').catch(() => {});

  const routehandlerSpan = await routehandlerSpanPromise;
  const routehandlerError = await errorEventPromise;

  expect(routehandlerSpan.status).toBe('error');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(String(routehandlerSpan.attributes['sentry.origin']?.value)).toContain('auto');

  expect(routehandlerError.exception?.values?.[0].value).toBe('Route handler error');

  expect(routehandlerError.request?.method).toBe('GET');
  expect(routehandlerError.request?.url).toContain('/route-handler/123/error');

  expect(routehandlerError.transaction).toContain('/route-handler/[xoxo]/error');
});
