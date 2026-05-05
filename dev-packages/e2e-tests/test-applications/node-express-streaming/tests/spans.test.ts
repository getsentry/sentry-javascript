import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

test('Sends streamed spans for an API route', async ({ baseURL }) => {
  const spansPromise = waitForStreamedSpans('node-express-streaming', spans => {
    return spans.some(
      span => span.name === 'GET /test-transaction' && getSpanOp(span) === 'http.server' && span.is_segment,
    );
  });

  await fetch(`${baseURL}/test-transaction`);

  const spans = await spansPromise;

  const rootSpan = spans.find(span => span.is_segment);
  expect(rootSpan).toBeDefined();
  expect(rootSpan!.name).toBe('GET /test-transaction');
  expect(getSpanOp(rootSpan!)).toBe('http.server');
  expect(rootSpan!.status).toBe('ok');
  expect(rootSpan!.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(rootSpan!.attributes?.['sentry.source']?.value).toBe('route');
  expect(rootSpan!.attributes?.['sentry.origin']?.value).toBe('auto.http.otel.http');
  expect(rootSpan!.attributes?.['http.response.status_code']?.value).toBe(200);

  const childSpans = spans.filter(span => !span.is_segment);

  expect(childSpans).toContainEqual(
    expect.objectContaining({
      name: 'test-span',
      is_segment: false,
      status: 'ok',
    }),
  );

  expect(childSpans).toContainEqual(
    expect.objectContaining({
      name: 'query',
      is_segment: false,
      status: 'ok',
    }),
  );

  expect(childSpans).toContainEqual(
    expect.objectContaining({
      name: 'expressInit',
      is_segment: false,
      status: 'ok',
    }),
  );

  expect(childSpans).toContainEqual(
    expect.objectContaining({
      name: '/test-transaction',
      is_segment: false,
      status: 'ok',
    }),
  );

  // All spans share the same trace_id
  for (const span of spans) {
    expect(span.trace_id).toBe(rootSpan!.trace_id);
  }
});

test('Sends streamed spans for an errored route', async ({ baseURL }) => {
  const rootSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return span.name === 'GET /test-exception/:id' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  await fetch(`${baseURL}/test-exception/777`);

  const rootSpan = await rootSpanPromise;

  expect(rootSpan.name).toBe('GET /test-exception/:id');
  expect(getSpanOp(rootSpan)).toBe('http.server');
  expect(rootSpan.status).toBe('error');
  expect(rootSpan.attributes?.['http.status_code']?.value).toBe(500);
});

test('Outgoing fetch spans are streamed', async ({ baseURL }) => {
  const fetchSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return getSpanOp(span) === 'http.client' && !span.is_segment && span.name.includes('localhost:3030/test-success');
  });

  await fetch(`${baseURL}/test-outgoing-fetch`);

  const fetchSpan = await fetchSpanPromise;

  expect(fetchSpan).toBeDefined();
  expect(fetchSpan.status).toBe('ok');
});

// TODO: headersToSpanAttributes has a pre-existing type error in packed tarballs (also affects the
// non-streaming node-express app). Re-enable once the NodeFetchOptions type is fixed upstream.
test.skip('Outgoing fetch spans include response headers when headersToSpanAttributes is configured', async ({
  baseURL,
}) => {
  const fetchSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return getSpanOp(span) === 'http.client' && !span.is_segment && span.name.includes('localhost:3030/test-success');
  });

  await fetch(`${baseURL}/test-outgoing-fetch`);

  const fetchSpan = await fetchSpanPromise;

  expect(fetchSpan).toBeDefined();
  expect(fetchSpan.attributes?.['http.response.header.content-length']).toBeDefined();
});

test('Extracts HTTP request headers as streamed span attributes', async ({ baseURL }) => {
  const rootSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return (
      span.name === 'GET /test-transaction' &&
      getSpanOp(span) === 'http.server' &&
      span.is_segment &&
      span.attributes?.['http.request.header.user_agent']?.value === 'Custom-Agent/1.0 (Test)'
    );
  });

  await fetch(`${baseURL}/test-transaction`, {
    headers: {
      'User-Agent': 'Custom-Agent/1.0 (Test)',
      'Content-Type': 'application/json',
      'X-Custom-Header': 'test-value',
      Accept: 'application/json, text/plain',
      'X-Request-ID': 'req-123',
    },
  });

  const rootSpan = await rootSpanPromise;

  expect(rootSpan.attributes?.['http.request.header.user_agent']?.value).toBe('Custom-Agent/1.0 (Test)');
  expect(rootSpan.attributes?.['http.request.header.content_type']?.value).toBe('application/json');
  expect(rootSpan.attributes?.['http.request.header.x_custom_header']?.value).toBe('test-value');
  expect(rootSpan.attributes?.['http.request.header.accept']?.value).toBe('application/json, text/plain');
  expect(rootSpan.attributes?.['http.request.header.x_request_id']?.value).toBe('req-123');
});
