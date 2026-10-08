import test, { expect } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should create a span for node route handlers', async ({ request }) => {
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === 'GET /route-handler/[xoxo]/node' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/node', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Node Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(routehandlerSpan.attributes['http.request.header.x-charly']?.value).toEqual(['gomez']);
});

test('Should create a span for edge route handlers', async ({ request }) => {
  test.skip(true, 'OpenNext does not support the Edge runtime');
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === 'GET /route-handler/[xoxo]/edge' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/edge', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Edge Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(routehandlerSpan.attributes['http.request.header.x-charly']?.value).toEqual(['gomez']);
});
