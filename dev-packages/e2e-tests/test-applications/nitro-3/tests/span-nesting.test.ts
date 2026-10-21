import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HANDLER, HTTP_SERVER, MIDDLEWARE } from '@sentry/conventions/op';

function collectNestingSpans() {
  return collectStreamedSpansUntilSegment('nitro-3', 'GET /api/test-nesting');
}

test('Span nesting: all spans share the same trace_id', async ({ request }) => {
  const spansPromise = collectNestingSpans();

  await request.get('/api/test-nesting');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment && span.name === 'GET /api/test-nesting');
  const traceId = segmentSpan?.trace_id;

  expect(traceId).toMatch(/[a-f0-9]{32}/);

  // Every span created during the request must belong to the same trace
  for (const name of ['db.select', 'db.insert', 'db.serialize']) {
    const span = spans.find(s => s.name === name);
    expect(span).toBeDefined();
    expect(span?.trace_id).toBe(traceId);
  }
});

test('Span nesting: the segment is the only http.server span', async ({ request }) => {
  const spansPromise = collectNestingSpans();

  await request.get('/api/test-nesting');

  const spans = await spansPromise;

  const httpServerSpans = spans.filter(span => getSpanOp(span) === HTTP_SERVER);
  expect(httpServerSpans).toHaveLength(1);
  expect(httpServerSpans[0]).toMatchObject({
    is_segment: true,
    attributes: expect.objectContaining({
      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.http.http_server' },
    }),
  });
});

test('Span nesting: h3 middleware spans are children of the segment span', async ({ request }) => {
  const spansPromise = collectNestingSpans();

  await request.get('/api/test-nesting');

  const spans = await spansPromise;

  const segmentSpan = spans.find(span => span.is_segment && span.name === 'GET /api/test-nesting');
  const h3MiddlewareSpans = spans.filter(
    span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.http.nitro.h3' && getSpanOp(span) === MIDDLEWARE,
  );
  expect(h3MiddlewareSpans.length).toBeGreaterThanOrEqual(1);

  for (const span of h3MiddlewareSpans) {
    expect(span.parent_span_id).toBe(segmentSpan!.span_id);
  }
});

test('Span nesting: h3 route handler span is a child of the segment span', async ({ request }) => {
  const spansPromise = collectNestingSpans();

  await request.get('/api/test-nesting');

  const spans = await spansPromise;

  const segmentSpan = spans.find(span => span.is_segment && span.name === 'GET /api/test-nesting');
  const h3HandlerSpan = spans.find(
    span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.http.nitro.h3' && getSpanOp(span) === HANDLER,
  );
  expect(h3HandlerSpan).toMatchObject({
    name: 'GET /api/test-nesting',
    parent_span_id: segmentSpan!.span_id,
  });
});

test('Span nesting: manual startSpan calls inside route handler are children of the h3 route handler span', async ({
  request,
}) => {
  const spansPromise = collectNestingSpans();

  await request.get('/api/test-nesting');

  const spans = await spansPromise;

  // Find the h3 route handler span
  const h3HandlerSpan = spans.find(
    span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.http.nitro.h3' && getSpanOp(span) === HANDLER,
  );
  expect(h3HandlerSpan).toBeDefined();

  // Find the manually created db spans
  const dbSelectSpan = spans.find(span => getSpanOp(span) === 'db' && span.name === 'db.select');
  const dbInsertSpan = spans.find(span => getSpanOp(span) === 'db' && span.name === 'db.insert');
  expect(dbSelectSpan).toBeDefined();
  expect(dbInsertSpan).toBeDefined();

  // Both db spans should be children of the h3 route handler span
  expect(dbSelectSpan!.parent_span_id).toBe(h3HandlerSpan!.span_id);
  expect(dbInsertSpan!.parent_span_id).toBe(h3HandlerSpan!.span_id);

  // Both db spans should be siblings (same parent)
  expect(dbSelectSpan!.parent_span_id).toBe(dbInsertSpan!.parent_span_id);

  // The serialize span should be nested inside the db.insert span
  const serializeSpan = spans.find(span => getSpanOp(span) === 'serialize' && span.name === 'db.serialize');
  expect(serializeSpan).toBeDefined();
  expect(serializeSpan!.parent_span_id).toBe(dbInsertSpan!.span_id);
});

test('Span nesting: middleware spans start before manual spans in the span tree', async ({ request }) => {
  const spansPromise = collectNestingSpans();

  await request.get('/api/test-nesting');

  const spans = await spansPromise;

  // Middleware spans should start before the manual db spans
  const middlewareSpans = spans.filter(span => getSpanOp(span) === 'middleware');
  const dbSpans = spans.filter(span => getSpanOp(span) === 'db');

  expect(middlewareSpans.length).toBeGreaterThanOrEqual(1);
  expect(dbSpans.length).toBeGreaterThanOrEqual(1);

  const earliestMiddlewareStart = Math.min(...middlewareSpans.map(s => s.start_timestamp));
  const earliestDbStart = Math.min(...dbSpans.map(s => s.start_timestamp));

  // Middleware should start before the db spans
  expect(earliestMiddlewareStart).toBeLessThanOrEqual(earliestDbStart);
});
