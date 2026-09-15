import crypto from 'crypto';
import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Propagates trace for outgoing http requests', async ({ baseURL }) => {
  const id = crypto.randomUUID();

  const inboundSegmentPromise = waitForStreamedSpan(
    'node-fastify-4',
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-inbound-headers/${id}`,
  );

  const outboundSegmentPromise = collectStreamedSpansUntilSegment(
    'node-fastify-4',
    segment =>
      getSpanOp(segment) === 'http.server' && segment.attributes?.['url.path']?.value === `/test-outgoing-http/${id}`,
  );

  const response = await fetch(`${baseURL}/test-outgoing-http/${id}`);
  const data = await response.json();

  const inboundSegment = await inboundSegmentPromise;
  const outboundSegmentSpans = await outboundSegmentPromise;
  const outboundSegment = outboundSegmentSpans.find(
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-http/${id}`,
  )!;

  const traceId = outboundSegment?.trace_id;
  const outgoingHttpSpan = outboundSegmentSpans
    .filter(span => !span.is_segment)
    ?.find(span => getSpanOp(span) === 'http.client');

  expect(outgoingHttpSpan).toBeDefined();

  const outgoingHttpSpanId = outgoingHttpSpan?.span_id;

  const outgoingHttpSpanData = outgoingHttpSpan?.attributes || {};
  // Outgoing span (`http.client`) does not include headers as attributes
  expect(Object.keys(outgoingHttpSpanData).some(key => key.startsWith('http.request.header.'))).toBe(false);

  expect(traceId).toEqual(expect.any(String));

  // data is passed through from the inbound request, to verify we have the correct headers set
  const inboundHeaderSentryTrace = data.headers?.['sentry-trace'];
  const inboundHeaderBaggage = data.headers?.['baggage'];

  expect(inboundHeaderSentryTrace).toEqual(`${traceId}-${outgoingHttpSpanId}-1`);
  expect(inboundHeaderBaggage).toBeDefined();

  const baggage = (inboundHeaderBaggage || '').split(',');
  expect(baggage).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );

  expect(outboundSegment).toEqual(
    expect.objectContaining({
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: traceId,
      attributes: expect.objectContaining({
        'sentry.segment.name.source': { value: 'route', type: 'string' },
        'sentry.origin': { value: 'auto.http.http_server', type: 'string' },
        'sentry.op': { value: 'http.server', type: 'string' },
        'sentry.sample_rate': { value: 1, type: 'integer' },
        'sentry.kind': { value: 'server', type: 'string' },
        'http.response.status_code': { value: 200, type: 'integer' },
        'url.full': { value: `http://localhost:3030/test-outgoing-http/${id}`, type: 'string' },
        'url.path': { value: `/test-outgoing-http/${id}`, type: 'string' },
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
        'http.route': { value: '/test-outgoing-http/:id', type: 'string' },
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

  expect(inboundSegment).toEqual(
    expect.objectContaining({
      parent_span_id: outgoingHttpSpanId,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: traceId,
      attributes: expect.objectContaining({
        'sentry.segment.name.source': { value: 'route', type: 'string' },
        'sentry.origin': { value: 'auto.http.http_server', type: 'string' },
        'sentry.op': { value: 'http.server', type: 'string' },
        'sentry.kind': { value: 'server', type: 'string' },
        'http.response.status_code': { value: 200, type: 'integer' },
        'url.full': { value: `http://localhost:3030/test-inbound-headers/${id}`, type: 'string' },
        'url.path': { value: `/test-inbound-headers/${id}`, type: 'string' },
        'server.address': { value: 'localhost', type: 'string' },
        'http.request.method': { value: 'GET', type: 'string' },
        'url.scheme': { value: 'http', type: 'string' },
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
        'http.route': { value: '/test-inbound-headers/:id', type: 'string' },
        'http.request.header.baggage': { value: [expect.any(String)], type: 'array' },
        'http.request.header.connection': { value: ['keep-alive'], type: 'array' },
        'http.request.header.host': { value: [expect.any(String)], type: 'array' },
        'http.request.header.sentry-trace': {
          value: [expect.stringMatching(/[a-f0-9]{32}-[a-f0-9]{16}-1/)],
          type: 'array',
        },
      }),
    }),
  );
});

test('Propagates trace for outgoing fetch requests', async ({ baseURL }) => {
  const id = crypto.randomUUID();

  const inboundSegmentPromise = waitForStreamedSpan(
    'node-fastify-4',
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-inbound-headers/${id}`,
  );

  const outboundSegmentPromise = collectStreamedSpansUntilSegment(
    'node-fastify-4',
    segment =>
      getSpanOp(segment) === 'http.server' && segment.attributes?.['url.path']?.value === `/test-outgoing-fetch/${id}`,
  );

  const response = await fetch(`${baseURL}/test-outgoing-fetch/${id}`);
  const data = await response.json();

  const inboundSegment = await inboundSegmentPromise;
  const outboundSegmentSpans = await outboundSegmentPromise;
  const outboundSegment = outboundSegmentSpans.find(
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-fetch/${id}`,
  )!;

  const traceId = outboundSegment?.trace_id;
  const outgoingHttpSpan = outboundSegmentSpans
    .filter(span => !span.is_segment)
    ?.find(span => getSpanOp(span) === 'http.client');

  expect(outgoingHttpSpan).toBeDefined();

  const outgoingHttpSpanId = outgoingHttpSpan?.span_id;

  const outgoingHttpSpanData = outgoingHttpSpan?.attributes || {};
  // Outgoing span (`http.client`) does not include headers as attributes
  expect(Object.keys(outgoingHttpSpanData).some(key => key.startsWith('http.request.header.'))).toBe(false);

  expect(traceId).toEqual(expect.any(String));

  // data is passed through from the inbound request, to verify we have the correct headers set
  const inboundHeaderSentryTrace = data.headers?.['sentry-trace'];
  const inboundHeaderBaggage = data.headers?.['baggage'];

  expect(inboundHeaderSentryTrace).toEqual(`${traceId}-${outgoingHttpSpanId}-1`);
  expect(inboundHeaderBaggage).toBeDefined();

  const baggage = (inboundHeaderBaggage || '').split(',');
  expect(baggage).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );

  expect(outboundSegment).toEqual(
    expect.objectContaining({
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: traceId,
      attributes: expect.objectContaining({
        'sentry.segment.name.source': { value: 'route', type: 'string' },
        'sentry.origin': { value: 'auto.http.http_server', type: 'string' },
        'sentry.op': { value: 'http.server', type: 'string' },
        'sentry.sample_rate': { value: 1, type: 'integer' },
        'sentry.kind': { value: 'server', type: 'string' },
        'http.response.status_code': { value: 200, type: 'integer' },
        'url.full': { value: `http://localhost:3030/test-outgoing-fetch/${id}`, type: 'string' },
        'url.path': { value: `/test-outgoing-fetch/${id}`, type: 'string' },
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
        'http.route': { value: '/test-outgoing-fetch/:id', type: 'string' },
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

  expect(inboundSegment).toEqual(
    expect.objectContaining({
      parent_span_id: outgoingHttpSpanId,
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: traceId,
      attributes: expect.objectContaining({
        'sentry.segment.name.source': { value: 'route', type: 'string' },
        'sentry.origin': { value: 'auto.http.http_server', type: 'string' },
        'sentry.op': { value: 'http.server', type: 'string' },
        'sentry.kind': { value: 'server', type: 'string' },
        'http.response.status_code': { value: 200, type: 'integer' },
        'url.full': { value: `http://localhost:3030/test-inbound-headers/${id}`, type: 'string' },
        'url.path': { value: `/test-inbound-headers/${id}`, type: 'string' },
        'server.address': { value: 'localhost', type: 'string' },
        'http.request.method': { value: 'GET', type: 'string' },
        'url.scheme': { value: 'http', type: 'string' },
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
        'http.route': { value: '/test-inbound-headers/:id', type: 'string' },
        'user_agent.original': { value: 'node', type: 'string' },
        'http.request.header.accept': { value: ['*/*'], type: 'array' },
        'http.request.header.accept-encoding': { value: ['gzip, deflate'], type: 'array' },
        'http.request.header.accept-language': { value: ['*'], type: 'array' },
        'http.request.header.baggage': { value: [expect.any(String)], type: 'array' },
        'http.request.header.connection': { value: ['keep-alive'], type: 'array' },
        'http.request.header.host': { value: [expect.any(String)], type: 'array' },
        'http.request.header.sec-fetch-mode': { value: ['cors'], type: 'array' },
        'http.request.header.sentry-trace': {
          value: [expect.stringMatching(/[a-f0-9]{32}-[a-f0-9]{16}-1/)],
          type: 'array',
        },
        'http.request.header.user-agent': { value: ['node'], type: 'array' },
      }),
    }),
  );
});

test('Propagates trace for outgoing external http requests', async ({ baseURL }) => {
  const inboundSegmentPromise = collectStreamedSpansUntilSegment(
    'node-fastify-4',
    segment =>
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-http-external-allowed`,
  );

  const response = await fetch(`${baseURL}/test-outgoing-http-external-allowed`);
  const data = await response.json();

  const inboundSegmentSpans = await inboundSegmentPromise;
  const inboundSegment = inboundSegmentSpans.find(
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-http-external-allowed`,
  )!;

  const traceId = inboundSegment?.trace_id;
  const spanId = inboundSegmentSpans
    .filter(span => !span.is_segment)
    ?.find(span => getSpanOp(span) === 'http.client')?.span_id;

  expect(traceId).toEqual(expect.any(String));
  expect(spanId).toEqual(expect.any(String));

  expect(data).toEqual({
    route: '/external-allowed',
    headers: expect.objectContaining({
      'sentry-trace': `${traceId}-${spanId}-1`,
      baggage: expect.any(String),
    }),
  });

  const baggage = (data.headers.baggage || '').split(',');
  expect(baggage).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );
});

test('Does not propagate outgoing http requests not covered by tracePropagationTargets', async ({ baseURL }) => {
  const inboundSegmentPromise = collectStreamedSpansUntilSegment(
    'node-fastify-4',
    segment =>
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-http-external-disallowed`,
  );

  const response = await fetch(`${baseURL}/test-outgoing-http-external-disallowed`);
  const data = await response.json();

  const inboundSegmentSpans = await inboundSegmentPromise;
  const inboundSegment = inboundSegmentSpans.find(
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-http-external-disallowed`,
  )!;

  const traceId = inboundSegment?.trace_id;
  const spanId = inboundSegmentSpans
    .filter(span => !span.is_segment)
    ?.find(span => getSpanOp(span) === 'http.client')?.span_id;

  expect(traceId).toEqual(expect.any(String));
  expect(spanId).toEqual(expect.any(String));

  expect(data.route).toBe('/external-disallowed');
  expect(data.headers?.['sentry-trace']).toBeUndefined();
  expect(data.headers?.baggage).toBeUndefined();
});

test('Propagates trace for outgoing external fetch requests', async ({ baseURL }) => {
  const inboundSegmentPromise = collectStreamedSpansUntilSegment(
    'node-fastify-4',
    segment =>
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-fetch-external-allowed`,
  );

  const response = await fetch(`${baseURL}/test-outgoing-fetch-external-allowed`);
  const data = await response.json();

  const inboundSegmentSpans = await inboundSegmentPromise;
  const inboundSegment = inboundSegmentSpans.find(
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-fetch-external-allowed`,
  )!;

  const traceId = inboundSegment?.trace_id;
  const spanId = inboundSegmentSpans
    .filter(span => !span.is_segment)
    ?.find(span => getSpanOp(span) === 'http.client')?.span_id;

  expect(traceId).toEqual(expect.any(String));
  expect(spanId).toEqual(expect.any(String));

  expect(data).toEqual({
    route: '/external-allowed',
    headers: expect.objectContaining({
      'sentry-trace': `${traceId}-${spanId}-1`,
      baggage: expect.any(String),
    }),
  });

  const baggage = (data.headers.baggage || '').split(',');
  expect(baggage).toEqual(
    expect.arrayContaining([
      'sentry-environment=qa',
      `sentry-trace_id=${traceId}`,
      expect.stringMatching(/sentry-public_key=/),
    ]),
  );
});

test('Does not propagate outgoing fetch requests not covered by tracePropagationTargets', async ({ baseURL }) => {
  const inboundSegmentPromise = collectStreamedSpansUntilSegment(
    'node-fastify-4',
    segment =>
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-fetch-external-disallowed`,
  );

  const response = await fetch(`${baseURL}/test-outgoing-fetch-external-disallowed`);
  const data = await response.json();

  const inboundSegmentSpans = await inboundSegmentPromise;
  const inboundSegment = inboundSegmentSpans.find(
    segment =>
      segment.is_segment &&
      getSpanOp(segment) === 'http.server' &&
      segment.attributes?.['url.path']?.value === `/test-outgoing-fetch-external-disallowed`,
  )!;

  const traceId = inboundSegment?.trace_id;
  const spanId = inboundSegmentSpans
    .filter(span => !span.is_segment)
    ?.find(span => getSpanOp(span) === 'http.client')?.span_id;

  expect(traceId).toEqual(expect.any(String));
  expect(spanId).toEqual(expect.any(String));

  expect(data.route).toBe('/external-disallowed');
  expect(data.headers?.['sentry-trace']).toBeUndefined();
  expect(data.headers?.baggage).toBeUndefined();
});
