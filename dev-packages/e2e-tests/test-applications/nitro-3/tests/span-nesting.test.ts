import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Span nesting: all spans share the same trace_id', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', event => {
    return event?.transaction === 'GET /api/test-nesting';
  });

  await request.get('/api/test-nesting');

  const event = await transactionEventPromise;
  const traceId = event.contexts?.trace?.trace_id;

  expect(traceId).toMatch(/[a-f0-9]{32}/);

  // Every child span must belong to the same trace
  for (const span of event.spans ?? []) {
    expect(span.trace_id).toBe(traceId);
  }
});

test('Span nesting: h3 middleware spans are children of the srvx request span', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', event => {
    return event?.transaction === 'GET /api/test-nesting';
  });

  await request.get('/api/test-nesting');

  const event = await transactionEventPromise;

  // Find the srvx request span
  const srvxSpan = event.spans?.find(span => span.origin === 'auto.http.nitro.srvx' && span.op === 'http.server');
  expect(srvxSpan).toBeDefined();

  // All h3 middleware spans should be children of the srvx span
  const h3Spans = event.spans?.filter(span => span.origin === 'auto.http.nitro.h3');
  expect(h3Spans?.length).toBeGreaterThanOrEqual(1);

  for (const span of h3Spans ?? []) {
    expect(span.parent_span_id).toBe(srvxSpan!.span_id);
  }
});

test('Span nesting: manual startSpan calls inside route handler are children of the srvx request span', async ({
  request,
}) => {
  const transactionEventPromise = waitForTransaction('nitro-3', event => {
    return event?.transaction === 'GET /api/test-nesting';
  });

  await request.get('/api/test-nesting');

  const event = await transactionEventPromise;

  // Find the srvx request span — this is the parent of all h3 and manual spans
  const srvxSpan = event.spans?.find(span => span.origin === 'auto.http.nitro.srvx' && span.op === 'http.server');
  expect(srvxSpan).toBeDefined();
  const srvxSpanId = srvxSpan!.span_id;

  // Find the manually created db spans
  const dbSelectSpan = event.spans?.find(span => span.op === 'db' && span.description === 'db.select');
  const dbInsertSpan = event.spans?.find(span => span.op === 'db' && span.description === 'db.insert');
  expect(dbSelectSpan).toBeDefined();
  expect(dbInsertSpan).toBeDefined();

  // FIXME: Once nitro's h3 tracing plugin emits a separate span for route handlers (type: "route"),
  // the db spans should be children of the h3 route handler span, not the srvx span directly.
  // Currently nitro bypasses h3's ~routes for file-based routing, so h3 only emits middleware spans.
  // Both db spans should be children of the srvx request span
  expect(dbSelectSpan!.parent_span_id).toBe(srvxSpanId);
  expect(dbInsertSpan!.parent_span_id).toBe(srvxSpanId);

  // Both db spans should be siblings (same parent)
  expect(dbSelectSpan!.parent_span_id).toBe(dbInsertSpan!.parent_span_id);

  // The serialize span should be nested inside the db.insert span
  const serializeSpan = event.spans?.find(span => span.op === 'serialize' && span.description === 'db.serialize');
  expect(serializeSpan).toBeDefined();
  expect(serializeSpan!.parent_span_id).toBe(dbInsertSpan!.span_id);
});

// FIXME: Nitro's file-based routing bypasses h3's ~routes, so h3's tracing plugin never wraps
// route handlers with type: "route". Once this is fixed upstream or we add our own wrapping,
// uncomment these tests to verify the h3 route handler span exists and is the parent of manual spans.
//
// test('Span nesting: h3 route handler span is a child of the srvx request span', async ({ request }) => {
//   const transactionEventPromise = waitForTransaction('nitro-3', event => {
//     return event?.transaction === 'GET /api/test-nesting';
//   });
//
//   await request.get('/api/test-nesting');
//
//   const event = await transactionEventPromise;
//
//   const srvxSpan = event.spans?.find(span => span.origin === 'auto.http.nitro.srvx' && span.op === 'http.server');
//   expect(srvxSpan).toBeDefined();
//
//   const h3HandlerSpan = event.spans?.find(
//     span => span.origin === 'auto.http.nitro.h3' && span.op === 'http.server',
//   );
//   expect(h3HandlerSpan).toBeDefined();
//   expect(h3HandlerSpan!.parent_span_id).toBe(srvxSpan!.span_id);
// });
//
// test('Span nesting: manual startSpan calls are children of the h3 route handler span', async ({ request }) => {
//   const transactionEventPromise = waitForTransaction('nitro-3', event => {
//     return event?.transaction === 'GET /api/test-nesting';
//   });
//
//   await request.get('/api/test-nesting');
//
//   const event = await transactionEventPromise;
//
//   const h3HandlerSpan = event.spans?.find(
//     span => span.origin === 'auto.http.nitro.h3' && span.op === 'http.server',
//   );
//   expect(h3HandlerSpan).toBeDefined();
//
//   const dbSelectSpan = event.spans?.find(span => span.op === 'db' && span.description === 'db.select');
//   const dbInsertSpan = event.spans?.find(span => span.op === 'db' && span.description === 'db.insert');
//   expect(dbSelectSpan!.parent_span_id).toBe(h3HandlerSpan!.span_id);
//   expect(dbInsertSpan!.parent_span_id).toBe(h3HandlerSpan!.span_id);
// });

test('Span nesting: middleware spans start before manual spans in the span tree', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nitro-3', event => {
    return event?.transaction === 'GET /api/test-nesting';
  });

  await request.get('/api/test-nesting');

  const event = await transactionEventPromise;

  // Middleware spans should start before the manual db spans
  const middlewareSpans = event.spans?.filter(span => span.op === 'middleware.nitro') ?? [];
  const dbSpans = event.spans?.filter(span => span.op === 'db') ?? [];

  expect(middlewareSpans.length).toBeGreaterThanOrEqual(1);
  expect(dbSpans.length).toBeGreaterThanOrEqual(1);

  const earliestMiddlewareStart = Math.min(...middlewareSpans.map(s => s.start_timestamp));
  const earliestDbStart = Math.min(...dbSpans.map(s => s.start_timestamp));

  // Middleware should start before the db spans
  expect(earliestMiddlewareStart).toBeLessThanOrEqual(earliestDbStart);
});
