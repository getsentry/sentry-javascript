import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a segment span for a successful route', async ({ request }) => {
  const spansPromise = collectStreamedSpans('nitro-3', spans =>
    spans.some(span => span.is_segment && span.name === 'GET /api/test-transaction'),
  );

  await request.get('/api/test-transaction');

  const spans = await spansPromise;

  // The node http server integration creates the segment span, and the only http.server span
  const segmentSpan = spans.find(span => span.is_segment && span.name === 'GET /api/test-transaction');
  expect(segmentSpan).toBeDefined();
  expect(segmentSpan?.attributes['sentry.origin']?.value).toBe('auto.http.http_server');
  expect(getSpanOp(segmentSpan!)).toBe('http.server');

  expect(spans.filter(span => getSpanOp(span) === 'http.server')).toHaveLength(1);

  // h3 creates a child span for the route handler
  const h3HandlerSpan = spans.find(
    span => span.attributes['sentry.origin']?.value === 'auto.http.nitro.h3' && getSpanOp(span) === 'handler',
  );
  expect(h3HandlerSpan?.parent_span_id).toBe(segmentSpan?.span_id);
});

test('Sets correct HTTP status code on the segment span', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan('nitro-3', span => {
    return span.is_segment && span.name === 'GET /api/test-transaction';
  });

  await request.get('/api/test-transaction');

  const segmentSpan = await segmentSpanPromise;

  expect(segmentSpan.attributes['http.response.status_code']?.value).toBe(200);
  expect(segmentSpan.status).toBe('ok');
});

test('Uses parameterized route for segment span name', async ({ request }) => {
  const segmentSpanPromise = waitForStreamedSpan('nitro-3', span => {
    return span.is_segment && span.name === 'GET /api/test-param/:id';
  });

  await request.get('/api/test-param/123');

  const segmentSpan = await segmentSpanPromise;

  expect(segmentSpan).toMatchObject({
    name: 'GET /api/test-param/:id',
    is_segment: true,
    attributes: expect.objectContaining({
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'http.route': { type: 'string', value: '/api/test-param/:id' },
    }),
  });
});

test('Sets Server-Timing response headers for trace propagation', async ({ request }) => {
  const response = await request.get('/api/test-transaction');
  const headers = response.headers();

  expect(headers['server-timing']).toBeDefined();
  expect(headers['server-timing']).toContain('sentry-trace;desc="');
  expect(headers['server-timing']).toContain('baggage;desc="');
});
