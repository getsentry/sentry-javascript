import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a segment span for a successful route', async ({ baseURL, request }) => {
  const spanPromise = waitForStreamedSpan('elysia-bun', span => {
    return getSpanOp(span) === 'http.server' && span.name === 'GET /test-success' && span.is_segment;
  });

  await request.get(`${baseURL}/test-success`);

  const span = await spanPromise;

  expect(span).toEqual(
    expect.objectContaining({
      name: 'GET /test-success',
      is_segment: true,
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
    }),
  );

  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.elysia', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.route': { value: '/test-success', type: 'string' },
  });
});

test('Sends a segment span with parameterized route name', async ({ baseURL, request }) => {
  const spanPromise = waitForStreamedSpan('elysia-bun', span => {
    return getSpanOp(span) === 'http.server' && span.name === 'GET /test-param/:param' && span.is_segment;
  });

  await request.get(`${baseURL}/test-param/123`);

  const span = await spanPromise;

  expect(span.name).toBe('GET /test-param/:param');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Sends a segment span with multiple parameterized segments', async ({ baseURL, request }) => {
  const spanPromise = waitForStreamedSpan('elysia-bun', span => {
    return (
      getSpanOp(span) === 'http.server' && span.name === 'GET /test-multi-param/:param1/:param2' && span.is_segment
    );
  });

  await request.get(`${baseURL}/test-multi-param/foo/bar`);

  const span = await spanPromise;

  expect(span.name).toBe('GET /test-multi-param/:param1/:param2');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Sends a segment span for an errored route', async ({ baseURL, request }) => {
  const spanPromise = waitForStreamedSpan('elysia-bun', span => {
    return getSpanOp(span) === 'http.server' && span.name === 'GET /test-exception/:id' && span.is_segment;
  });

  await request.get(`${baseURL}/test-exception/777`);

  const span = await spanPromise;

  expect(span.name).toBe('GET /test-exception/:id');
  expect(span.status).toBe('error');
});

test('Includes manually started spans with parent-child relationship', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('elysia-bun', 'GET /test-transaction');

  await request.get(`${baseURL}/test-transaction`);

  const spans = await spansPromise;

  const testSpan = spans.find(span => span.name === 'test-span');
  const childSpan = spans.find(span => span.name === 'child-span');

  expect(testSpan).toEqual(
    expect.objectContaining({
      name: 'test-span',
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'manual', type: 'string' },
      }),
    }),
  );

  expect(childSpan).toEqual(
    expect.objectContaining({
      name: 'child-span',
      parent_span_id: testSpan?.span_id,
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'manual', type: 'string' },
      }),
    }),
  );
});

test('Creates lifecycle spans for Elysia hooks', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('elysia-bun', 'GET /test-success');

  await request.get(`${baseURL}/test-success`);

  const spans = await spansPromise;

  // Elysia should produce lifecycle spans enriched with sentry attributes
  const elysiaSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.http.elysia');
  expect(elysiaSpans.length).toBeGreaterThan(0);

  // With span streaming, request handler spans are named after their route
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: '/test-success',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'handler', type: 'string' },
        'sentry.origin': { value: 'auto.http.elysia', type: 'string' },
        'http.route': { value: '/test-success', type: 'string' },
      }),
    }),
  );
});

test('Names handler spans after the route instead of "<unknown>"', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('elysia-bun', 'GET /with-middleware/test');

  // Use a route with middleware so there are child handler spans
  await request.get(`${baseURL}/with-middleware/test`);

  const spans = await spansPromise;

  // No <unknown> spans should exist
  const unknownSpans = spans.filter(span => span.name === '<unknown>');
  expect(unknownSpans).toHaveLength(0);

  // Handler spans are named after the route, so the (anonymous) handler name never becomes a span name
  const handlerSpans = spans.filter(span => getSpanOp(span) === 'handler');
  expect(handlerSpans.length).toBeGreaterThan(0);
  expect(handlerSpans.every(span => span.name === '/with-middleware/test')).toBe(true);

  // Named Elysia lifecycle spans should still be present
  expect(spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.http.elysia').length).toBeGreaterThan(
    0,
  );
});

test('Creates lifecycle spans for route-specific middleware', async ({ baseURL, request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('elysia-bun', 'GET /with-middleware/test');

  await request.get(`${baseURL}/with-middleware/test`);

  const spans = await spansPromise;

  // BeforeHandle span should be present from the route-specific middleware
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'BeforeHandle',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'middleware', type: 'string' },
        'sentry.origin': { value: 'auto.http.elysia', type: 'string' },
      }),
    }),
  );
});

test('Captures request metadata for POST requests', async ({ baseURL, request }) => {
  const spanPromise = waitForStreamedSpan('elysia-bun', span => {
    return getSpanOp(span) === 'http.server' && span.name === 'POST /test-post' && span.is_segment;
  });

  const response = await request.post(`${baseURL}/test-post`, {
    data: { foo: 'bar', other: 1 },
    headers: { 'Content-Type': 'application/json' },
  });
  const resBody = await response.json();

  expect(resBody).toEqual({ status: 'ok', body: { foo: 'bar', other: 1 } });

  const span = await spanPromise;

  expect(span.attributes).toMatchObject({
    'url.path': { value: '/test-post', type: 'string' },
    'url.full': { value: expect.stringContaining('/test-post'), type: 'string' },
  });
});
