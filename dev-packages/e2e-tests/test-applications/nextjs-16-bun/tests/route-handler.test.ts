import test, { expect } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should create a span for node route handlers', async ({ request }) => {
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-16-bun', span => {
    return span.name === 'GET /route-handler/[xoxo]/node' && span.is_segment;
  });

  const response = await request.get('/route-handler/123/node', { headers: { 'x-charly': 'gomez' } });
  expect(await response.json()).toStrictEqual({ message: 'Hello Node Route Handler' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
});
