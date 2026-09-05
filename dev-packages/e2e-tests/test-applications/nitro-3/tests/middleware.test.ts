import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Creates middleware spans for requests', async ({ request }) => {
  const spansPromise = collectStreamedSpans('nitro-3', spans =>
    spans.some(span => span.is_segment && span.name === 'GET /api/test-transaction'),
  );

  const response = await request.get('/api/test-transaction');

  expect(response.headers()['x-sentry-test-middleware']).toBe('executed');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment && span.name === 'GET /api/test-transaction');

  // h3 middleware spans have origin auto.http.nitro.h3 and op middleware
  const h3MiddlewareSpans = spans.filter(
    span =>
      span.trace_id === segmentSpan?.trace_id &&
      span.attributes['sentry.origin']?.value === 'auto.http.nitro.h3' &&
      getSpanOp(span) === 'middleware',
  );
  expect(h3MiddlewareSpans.length).toBeGreaterThanOrEqual(1);
});

test('Captures errors thrown in middleware with error status on span', async ({ request }) => {
  const errorEventPromise = waitForError('nitro-3', event => {
    return !event.type && !!event.exception?.values?.some(v => v.value === 'Middleware error');
  });

  // The middleware throws before the route handler runs, so the segment may keep its bare
  // method-only name - select it by URL path instead.
  const segmentSpanPromise = waitForStreamedSpan('nitro-3', span => {
    return span.is_segment && span.attributes['url.path']?.value === '/api/test-transaction' && span.status === 'error';
  });

  await request.get('/api/test-transaction?middleware-error=1');

  const errorEvent = await errorEventPromise;
  expect(errorEvent.exception?.values?.some(v => v.value === 'Middleware error')).toBe(true);

  const segmentSpan = await segmentSpanPromise;

  // The segment span should have error status
  expect(segmentSpan.status).toBe('error');
});
