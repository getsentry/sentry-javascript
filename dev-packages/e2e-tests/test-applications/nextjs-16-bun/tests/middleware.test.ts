import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should create a span for middleware', async ({ request }) => {
  const middlewareSpanPromise = waitForStreamedSpan('nextjs-16-bun', span => {
    return span.name === 'middleware GET' && span.is_segment;
  });

  const response = await request.get('/api/endpoint-behind-middleware');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const middlewareSpan = await middlewareSpanPromise;

  expect(middlewareSpan.status).toBe('ok');
  expect(getSpanOp(middlewareSpan)).toBe('middleware');
  expect(middlewareSpan.attributes['sentry.segment.name.source']?.value).toBe('route');
});
