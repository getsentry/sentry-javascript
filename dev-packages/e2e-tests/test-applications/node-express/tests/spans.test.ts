import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Sends an API route span', async ({ baseURL }) => {
  const pageloadSegmentEventPromise = collectStreamedSpansUntilSegment(
    'node-express',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-transaction',
  );

  await fetch(`${baseURL}/test-transaction`);

  const segmentEventSpans = await pageloadSegmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-transaction',
  )!;

  expect(segmentEvent).toEqual(
    expect.objectContaining({
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'sentry.segment.name.source': { value: 'route', type: 'string' },
        'sentry.origin': { value: 'auto.http.http_server', type: 'string' },
        'sentry.op': { value: 'http.server', type: 'string' },
        'sentry.sample_rate': { value: 1, type: 'integer' },
        'sentry.kind': { value: 'server', type: 'string' },
        'http.response.status_code': { value: 200, type: 'integer' },
        'url.full': { value: 'http://localhost:3030/test-transaction', type: 'string' },
        'url.path': { value: '/test-transaction', type: 'string' },
        'server.address': { value: 'localhost', type: 'string' },
        'http.request.method': { value: 'GET', type: 'string' },
        'url.scheme': { value: 'http', type: 'string' },
        'user_agent.original': { value: 'node', type: 'string' },
        'client.address': { value: '::1', type: 'string' },
        'client.port': { value: expect.any(Number), type: 'integer' },
        'network.transport': { value: 'tcp', type: 'string' },
        'network.local.address': { value: expect.any(String), type: 'string' },
        'network.local.port': { value: expect.any(Number), type: 'integer' },
        'network.peer.address': { value: expect.any(String), type: 'string' },
        'network.peer.port': { value: expect.any(Number), type: 'integer' },
        'network.protocol.name': { value: 'http', type: 'string' },
        'network.protocol.version': { value: '1.1', type: 'string' },
        'server.port': { value: 3030, type: 'integer' },
        'http.response.status_text': { value: 'OK', type: 'string' },
        'http.route': { value: '/test-transaction', type: 'string' },
        'http.request.header.accept': { value: '*/*', type: 'string' },
        'http.request.header.accept_encoding': { value: 'gzip, deflate', type: 'string' },
        'http.request.header.accept_language': { value: '*', type: 'string' },
        'http.request.header.connection': { value: 'keep-alive', type: 'string' },
        'http.request.header.host': { value: expect.any(String), type: 'string' },
        'http.request.header.sec_fetch_mode': { value: 'cors', type: 'string' },
        'http.request.header.user_agent': { value: 'node', type: 'string' },
      }),
    }),
  );

  expect(segmentEvent.attributes['http.response.status_code']?.value).toBe(200);

  expect(segmentEvent).toEqual(
    expect.objectContaining({
      name: 'GET /test-transaction',
      is_segment: true,
      attributes: expect.objectContaining({ 'sentry.segment.name.source': { value: 'route', type: 'string' } }),
    }),
  );

  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );

  // Manually started span
  expect(spans.filter(span => span.name === 'test-span')).toEqual([
    expect.objectContaining({
      name: 'test-span',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({ 'sentry.origin': { value: 'manual', type: 'string' } }),
    }),
  ]);

  // auto instrumented spans
  expect(spans.filter(span => span.name === 'query')).toEqual([
    expect.objectContaining({
      name: 'query',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'middleware', type: 'string' },
        'express.name': { value: 'query', type: 'string' },
        'express.type': { value: 'middleware', type: 'string' },
      }),
    }),
  ]);

  expect(spans.filter(span => span.name === 'expressInit')).toEqual([
    expect.objectContaining({
      name: 'expressInit',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'middleware', type: 'string' },
        'express.name': { value: 'expressInit', type: 'string' },
        'express.type': { value: 'middleware', type: 'string' },
      }),
    }),
  ]);

  expect(spans.filter(span => span.name === '/test-transaction')).toEqual([
    expect.objectContaining({
      name: '/test-transaction',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'handler', type: 'string' },
        'http.route': { value: '/test-transaction', type: 'string' },
        'express.name': { value: '/test-transaction', type: 'string' },
        'express.type': { value: 'request_handler', type: 'string' },
      }),
    }),
  ]);
});

test('Sends an API route span for an errored route', async ({ baseURL }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'node-express',
    segment =>
      getSpanOp(segment) === 'http.server' &&
      segment.name === 'GET /test-exception/:id' &&
      segment.attributes['url.full']?.value === 'http://localhost:3030/test-exception/777',
  );

  await fetch(`${baseURL}/test-exception/777`);

  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.name === 'GET /test-exception/:id' &&
      segment.attributes['url.full']?.value === 'http://localhost:3030/test-exception/777',
  )!;

  expect(getSpanOp(segmentEvent)).toEqual('http.server');
  expect(segmentEvent.name).toEqual('GET /test-exception/:id');
  expect(segmentEvent?.status).toEqual('error');
  expect(segmentEvent.attributes?.['http.response.status_code']?.value).toEqual(500);

  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );

  expect(spans.filter(span => span.name === 'query')).toEqual([
    expect.objectContaining({
      name: 'query',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'middleware', type: 'string' },
        'express.name': { value: 'query', type: 'string' },
        'express.type': { value: 'middleware', type: 'string' },
      }),
    }),
  ]);

  expect(spans.filter(span => span.name === 'expressInit')).toEqual([
    expect.objectContaining({
      name: 'expressInit',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'middleware', type: 'string' },
        'express.name': { value: 'expressInit', type: 'string' },
        'express.type': { value: 'middleware', type: 'string' },
      }),
    }),
  ]);

  expect(spans.filter(span => span.name === '/test-exception/:id')).toEqual([
    expect.objectContaining({
      name: '/test-exception/:id',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'error',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'sentry.origin': { value: 'auto.http.express', type: 'string' },
        'sentry.op': { value: 'handler', type: 'string' },
        'http.route': { value: '/test-exception/:id', type: 'string' },
        'express.name': { value: '/test-exception/:id', type: 'string' },
        'express.type': { value: 'request_handler', type: 'string' },
        'error.type': { value: 'Error', type: 'string' },
      }),
    }),
  ]);
});

test('Outgoing fetch spans include response headers when headersToSpanAttributes is configured', async ({
  baseURL,
}) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'node-express',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-outgoing-fetch',
  );

  await fetch(`${baseURL}/test-outgoing-fetch`);

  const segmentEventSpans = await segmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment =>
      segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-outgoing-fetch',
  )!;

  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );

  // Find the outgoing fetch span (http.client operation from undici instrumentation)
  const fetchSpan = spans.find(
    span =>
      getSpanOp(span) === 'http.client' && span.attributes['url.full']?.value === 'http://localhost:3030/test-success',
  );

  expect(fetchSpan).toBeDefined();
  expect(fetchSpan?.name).toBe('GET localhost');
  expect(fetchSpan?.attributes).toEqual(
    expect.objectContaining({ 'http.response.header.content-length': { value: [expect.any(String)], type: 'array' } }),
  );
});

test('Extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const segmentEventPromise = waitForStreamedSpan(
    'node-express',
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-transaction',
  );

  await fetch(`${baseURL}/test-transaction`, {
    headers: {
      'User-Agent': 'Custom-Agent/1.0 (Test)',
      'Content-Type': 'application/json',
      'X-Custom-Header': 'test-value',
      Accept: 'application/json, text/plain',
      'X-Request-ID': 'req-123',
    },
  });

  const segmentEvent = await segmentEventPromise;

  expect(segmentEvent.attributes).toEqual(
    expect.objectContaining({
      'http.request.header.user_agent': { value: 'Custom-Agent/1.0 (Test)', type: 'string' },
      'http.request.header.content_type': { value: 'application/json', type: 'string' },
      'http.request.header.x_custom_header': { value: 'test-value', type: 'string' },
      'http.request.header.accept': { value: 'application/json, text/plain', type: 'string' },
      'http.request.header.x_request_id': { value: 'req-123', type: 'string' },
    }),
  );
});
