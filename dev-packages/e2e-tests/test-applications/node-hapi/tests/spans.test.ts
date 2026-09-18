import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Sends successful span', async ({ baseURL }) => {
  const pageloadSegmentEventPromise = collectStreamedSpansUntilSegment(
    'node-hapi',
    segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-success',
  );

  await fetch(`${baseURL}/test-success`);

  const segmentEventSpans = await pageloadSegmentEventPromise;
  const segmentEvent = segmentEventSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-success',
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
        'url.full': { value: 'http://localhost:3030/test-success', type: 'string' },
        'url.path': { value: '/test-success', type: 'string' },
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
        'http.route': { value: '/test-success', type: 'string' },
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
      name: 'GET /test-success',
      is_segment: true,
      attributes: expect.objectContaining({ 'sentry.segment.name.source': { value: 'route', type: 'string' } }),
    }),
  );

  const spans = segmentEventSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segmentEvent.span_id,
  );

  spans.forEach(span => {
    expect(Object.keys(span.attributes).some(key => key.startsWith('http.request.header.'))).toBe(false);
  });

  expect(spans).toEqual([
    expect.objectContaining({
      name: '/test-success',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'hapi.type': { value: 'router', type: 'string' },
        'http.request.method': { value: 'GET', type: 'string' },
        'http.route': { value: '/test-success', type: 'string' },
        'sentry.op': { value: 'router', type: 'string' },
        'sentry.origin': { value: 'auto.http.hapi', type: 'string' },
      }),
    }),
    expect.objectContaining({
      name: 'ext - onPreResponse',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      end_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      attributes: expect.objectContaining({
        'hapi.type': { value: 'server.ext', type: 'string' },
        'sentry.op': { value: 'middleware', type: 'string' },
        'sentry.origin': { value: 'auto.http.hapi', type: 'string' },
        'server.ext.type': { value: 'onPreResponse', type: 'string' },
      }),
    }),
  ]);
});

test('Sends parameterized spans to Sentry', async ({ baseURL }) => {
  const pageloadSegmentEventPromise = waitForStreamedSpan(
    'node-hapi',
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-param/{param}',
  );

  await fetch(`${baseURL}/test-param/123`);

  const segmentEvent = await pageloadSegmentEventPromise;

  expect(getSpanOp(segmentEvent)).toBe('http.server');
  expect(segmentEvent.attributes?.['http.route']?.value).toBe('/test-param/{param}');
  expect(segmentEvent.name).toBe('GET /test-param/{param}');
});

test('Isolates requests', async ({ baseURL }) => {
  const segment1Promise = waitForStreamedSpan(
    'node-hapi',
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === '/test-param/888',
  );
  const segment2Promise = waitForStreamedSpan(
    'node-hapi',
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === '/test-param/999',
  );

  await Promise.all([fetch(`${baseURL}/test-param/888`), fetch(`${baseURL}/test-param/999`)]);

  const segment1 = await segment1Promise;
  const segment2 = await segment2Promise;

  expect(segment1.attributes['param-888']?.value).toBe('yes');
  expect(segment1.attributes['param-999']).toBeUndefined();
  expect(segment2.attributes['param-999']?.value).toBe('yes');
  expect(segment2.attributes['param-888']).toBeUndefined();
});
