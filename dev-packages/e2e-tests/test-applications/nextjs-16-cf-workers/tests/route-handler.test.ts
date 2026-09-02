import test, { expect } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.skip('Should create a span for node route handlers', async ({ request }) => {
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === 'GET /route-handler/[xoxo]/node' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/node', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Node Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');

  // Custom headers are not captured on Cloudflare Workers
  // This assertion is skipped for CF Workers environment
});

test('Should create a span for edge route handlers', async ({ request }) => {
  // This test only works for webpack builds on non-async param extraction
  // todo: check if we can set request headers for edge on sdkProcessingMetadata
  test.skip();
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === 'GET /route-handler/[xoxo]/edge' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/edge', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Edge Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(routehandlerSpan.attributes['http.request.header.x_charly']?.value).toBe('gomez');
});
