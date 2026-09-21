import { expect, test } from '@playwright/test';
import { getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Sends an API route span', async ({ baseURL }) => {
  const segmentEventPromise = collectStreamedSpansUntilSegment(
    'tsx-express',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-transaction',
  );

  await fetch(`${baseURL}/test-transaction`);

  const segmentEventSpans = await segmentEventPromise;
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
        'http.request.header.accept': { value: ['*/*'], type: 'array' },
        'http.request.header.accept-encoding': { value: ['gzip, deflate'], type: 'array' },
        'http.request.header.accept-language': { value: ['*'], type: 'array' },
        'http.request.header.connection': { value: ['keep-alive'], type: 'array' },
        'http.request.header.host': { value: [expect.any(String)], type: 'array' },
        'http.request.header.sec-fetch-mode': { value: ['cors'], type: 'array' },
        'http.request.header.user-agent': { value: ['node'], type: 'array' },
      }),
    }),
  );

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
    'tsx-express',
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
