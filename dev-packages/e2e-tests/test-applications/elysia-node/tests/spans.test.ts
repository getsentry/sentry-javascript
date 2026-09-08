import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Sends a span for a successful route', async ({ baseURL, request }) => {
  const segmentEventPromise = waitForStreamedSpan(
    'elysia-node',
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-success',
  );

  await request.get(`${baseURL}/test-success`);

  const segmentEvent = await segmentEventPromise;

  expect(segmentEvent).toEqual(
    expect.objectContaining({
      name: 'GET /test-success',
      is_segment: true,
      attributes: expect.objectContaining({ 'sentry.segment.name.source': { value: 'route', type: 'string' } }),
    }),
  );

  expect(segmentEvent).toEqual(
    expect.objectContaining({
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      attributes: expect.objectContaining({ 'sentry.op': { value: 'http.server', type: 'string' } }),
    }),
  );
});

test('Sends a span with parameterized route name', async ({ baseURL, request }) => {
  const segmentEventPromise = waitForStreamedSpan(
    'elysia-node',
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-param/:param',
  );

  await request.get(`${baseURL}/test-param/123`);

  const segmentEvent = await segmentEventPromise;

  expect(segmentEvent.name).toBe('GET /test-param/:param');
  expect(segmentEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Sends a span with multiple parameterized segments', async ({ baseURL, request }) => {
  const segmentEventPromise = waitForStreamedSpan(
    'elysia-node',
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.name === 'GET /test-multi-param/:param1/:param2',
  );

  await request.get(`${baseURL}/test-multi-param/foo/bar`);

  const segmentEvent = await segmentEventPromise;

  expect(segmentEvent.name).toBe('GET /test-multi-param/:param1/:param2');
  expect(segmentEvent.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Sends a span for an errored route', async ({ baseURL, request }) => {
  const segmentEventPromise = waitForStreamedSpan(
    'elysia-node',
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-exception/:id',
  );

  await request.get(`${baseURL}/test-exception/777`);

  const segmentEvent = await segmentEventPromise;

  expect(segmentEvent.name).toBe('GET /test-exception/:id');
  expect(segmentEvent?.status).toBe('error');
});

test('Includes manually started spans with parent-child relationship', async ({ baseURL, request }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'elysia-node',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-transaction',
  );

  await request.get(`${baseURL}/test-transaction`);

  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-transaction',
  )!;
  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );

  const testSpan = spans.find(span => span.name === 'test-span');
  const childSpan = spans.find(span => span.name === 'child-span');

  expect(testSpan).toEqual(
    expect.objectContaining({
      name: 'test-span',
      attributes: expect.objectContaining({ 'sentry.origin': { value: 'manual', type: 'string' } }),
    }),
  );

  expect(childSpan).toEqual(
    expect.objectContaining({
      name: 'child-span',
      parent_span_id: testSpan?.span_id,
      attributes: expect.objectContaining({ 'sentry.origin': { value: 'manual', type: 'string' } }),
    }),
  );
});

test('Creates lifecycle spans for Elysia hooks', async ({ baseURL, request }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'elysia-node',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-success',
  );

  await request.get(`${baseURL}/test-success`);

  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-success',
  )!;
  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );

  // Elysia should produce lifecycle spans enriched with sentry attributes
  const elysiaSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.http.elysia');
  expect(elysiaSpans.length).toBeGreaterThan(0);

  expect(spans.filter(span => span.name === '/test-success')).toEqual([
    expect.objectContaining({
      name: '/test-success',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'handler', type: 'string' },
        'sentry.origin': { value: 'auto.http.elysia', type: 'string' },
      }),
    }),
  ]);
});

test('Names middleware "anonymous" and handlers after their route', async ({ baseURL, request }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'elysia-node',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /with-middleware/test',
  );

  await request.get(`${baseURL}/with-middleware/test`);

  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment =>
      segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /with-middleware/test',
  )!;
  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );

  const unknownSpans = spans.filter(span => span.name === '<unknown>');
  expect(unknownSpans).toHaveLength(0);

  const elysiaSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.http.elysia');
  const anonymousMiddlewareSpans = elysiaSpans.filter(
    span => getSpanOp(span) === 'middleware' && span.name === 'anonymous',
  );
  expect(anonymousMiddlewareSpans).toHaveLength(1);

  const handlerSpans = elysiaSpans.filter(span => getSpanOp(span) === 'handler');
  expect(handlerSpans.map(span => span.name)).toEqual(['/with-middleware/test']);
});

test('Creates lifecycle spans for route-specific middleware', async ({ baseURL, request }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'elysia-node',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /with-middleware/test',
  );

  await request.get(`${baseURL}/with-middleware/test`);

  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment =>
      segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /with-middleware/test',
  )!;
  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );

  // BeforeHandle span should be present from the route-specific middleware
  expect(spans.filter(span => span.name === 'BeforeHandle')).toEqual([
    expect.objectContaining({
      name: 'BeforeHandle',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'middleware', type: 'string' },
        'sentry.origin': { value: 'auto.http.elysia', type: 'string' },
      }),
    }),
  ]);
});

test('Captures request metadata for POST requests', async ({ baseURL, request }) => {
  const segmentEventPromise = waitForStreamedSpan(
    'elysia-node',
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'POST /test-post',
  );

  const response = await request.post(`${baseURL}/test-post`, {
    data: { foo: 'bar', other: 1 },
    headers: { 'Content-Type': 'application/json' },
  });
  const resBody = await response.json();

  expect(resBody).toEqual({ status: 'ok', body: { foo: 'bar', other: 1 } });

  const segmentEvent = await segmentEventPromise;

  expect(segmentEvent.attributes['http.request.method']?.value).toEqual('POST');
  expect(segmentEvent.attributes['url.full']?.value).toEqual(expect.stringContaining('/test-post'));
  expect(segmentEvent.attributes['http.request.header.content_type']?.value).toEqual('application/json');
});
