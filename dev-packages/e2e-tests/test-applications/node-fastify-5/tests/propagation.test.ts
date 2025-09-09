import crypto from 'crypto';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Propagates trace for outgoing http requests', async ({ baseURL }) => {
  const id = crypto.randomUUID();

  const inboundTransactionPromise = waitForTransaction('node-fastify-5', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-inbound-headers/${id}`
    );
  });

  const outboundTransactionPromise = waitForTransaction('node-fastify-5', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-http/${id}`
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-http/${id}`);
  const data = await response.json();

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  const outgoingHttpSpan = outboundTransaction?.spans?.find(span => span.op === 'http.client');

  expect(outgoingHttpSpan).toBeDefined();

  const outgoingHttpSpanId = outgoingHttpSpan?.span_id;

  const outgoingHttpSpanData = outgoingHttpSpan?.data || {};
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

  expect(outboundTransaction.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      url: `http://localhost:3030/test-outgoing-http/${id}`,
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': `http://localhost:3030/test-outgoing-http/${id}`,
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': `/test-outgoing-http/${id}`,
      'http.user_agent': 'node',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-outgoing-http/:id',
      'http.request.header.accept': '*/*',
      'http.request.header.accept_encoding': 'gzip, deflate',
      'http.request.header.accept_language': '*',
      'http.request.header.connection': 'keep-alive',
      'http.request.header.host': 'localhost:3030',
      'http.request.header.sec_fetch_mode': 'cors',
      'http.request.header.user_agent': 'node',
    },
    op: 'http.server',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });

  expect(inboundTransaction.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      url: `http://localhost:3030/test-inbound-headers/${id}`,
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': `http://localhost:3030/test-inbound-headers/${id}`,
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': `/test-inbound-headers/${id}`,
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-inbound-headers/:id',
      'http.request.header.baggage': expect.any(String),
      'http.request.header.connection': 'keep-alive',
      'http.request.header.host': expect.any(String),
      'http.request.header.sentry_trace': expect.stringMatching(/[a-f0-9]{32}-[a-f0-9]{16}-1/),
    },
    op: 'http.server',
    parent_span_id: outgoingHttpSpanId,
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });
});

test('Propagates trace for outgoing fetch requests', async ({ baseURL }) => {
  const id = crypto.randomUUID();

  const inboundTransactionPromise = waitForTransaction('node-fastify-5', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-inbound-headers/${id}`
    );
  });

  const outboundTransactionPromise = waitForTransaction('node-fastify-5', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-fetch/${id}`
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-fetch/${id}`);
  const data = await response.json();

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  const outgoingHttpSpan = outboundTransaction?.spans?.find(span => span.op === 'http.client');

  expect(outgoingHttpSpan).toBeDefined();

  const outgoingHttpSpanId = outgoingHttpSpan?.span_id;

  const outgoingHttpSpanData = outgoingHttpSpan?.data || {};
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

  expect(outboundTransaction.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      url: `http://localhost:3030/test-outgoing-fetch/${id}`,
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': `http://localhost:3030/test-outgoing-fetch/${id}`,
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': `/test-outgoing-fetch/${id}`,
      'http.user_agent': 'node',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-outgoing-fetch/:id',
      'http.request.header.accept': '*/*',
      'http.request.header.accept_encoding': 'gzip, deflate',
      'http.request.header.accept_language': '*',
      'http.request.header.connection': 'keep-alive',
      'http.request.header.host': expect.any(String),
      'http.request.header.sec_fetch_mode': 'cors',
      'http.request.header.user_agent': 'node',
    },
    op: 'http.server',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });

  expect(inboundTransaction.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      url: `http://localhost:3030/test-inbound-headers/${id}`,
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': `http://localhost:3030/test-inbound-headers/${id}`,
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': `/test-inbound-headers/${id}`,
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.user_agent': 'node',
      'http.route': '/test-inbound-headers/:id',
      'http.request.header.accept': '*/*',
      'http.request.header.accept_encoding': 'gzip, deflate',
      'http.request.header.accept_language': '*',
      'http.request.header.baggage': expect.any(String),
      'http.request.header.connection': 'keep-alive',
      'http.request.header.host': expect.any(String),
      'http.request.header.sec_fetch_mode': 'cors',
      'http.request.header.sentry_trace': expect.stringMatching(/[a-f0-9]{32}-[a-f0-9]{16}-1/),
      'http.request.header.user_agent': 'node',
    },
    op: 'http.server',
    parent_span_id: outgoingHttpSpanId,
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });
});

test('Propagates trace for outgoing external http requests', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('node-fastify-5', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-http-external-allowed`
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-http-external-allowed`);
  const data = await response.json();

  const inboundTransaction = await inboundTransactionPromise;

  const traceId = inboundTransaction?.contexts?.trace?.trace_id;
  const spanId = inboundTransaction?.spans?.find(span => span.op === 'http.client')?.span_id;

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
  const inboundTransactionPromise = waitForTransaction('node-fastify-5', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-http-external-disallowed`
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-http-external-disallowed`);
  const data = await response.json();

  const inboundTransaction = await inboundTransactionPromise;

  const traceId = inboundTransaction?.contexts?.trace?.trace_id;
  const spanId = inboundTransaction?.spans?.find(span => span.op === 'http.client')?.span_id;

  expect(traceId).toEqual(expect.any(String));
  expect(spanId).toEqual(expect.any(String));

  expect(data.route).toBe('/external-disallowed');
  expect(data.headers?.['sentry-trace']).toBeUndefined();
  expect(data.headers?.baggage).toBeUndefined();
});

test('Propagates trace for outgoing external fetch requests', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('node-fastify-5', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-fetch-external-allowed`
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-fetch-external-allowed`);
  const data = await response.json();

  const inboundTransaction = await inboundTransactionPromise;

  const traceId = inboundTransaction?.contexts?.trace?.trace_id;
  const spanId = inboundTransaction?.spans?.find(span => span.op === 'http.client')?.span_id;

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
  const inboundTransactionPromise = waitForTransaction('node-fastify-5', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-fetch-external-disallowed`
    );
  });

  const response = await fetch(`${baseURL}/test-outgoing-fetch-external-disallowed`);
  const data = await response.json();

  const inboundTransaction = await inboundTransactionPromise;

  const traceId = inboundTransaction?.contexts?.trace?.trace_id;
  const spanId = inboundTransaction?.spans?.find(span => span.op === 'http.client')?.span_id;

  expect(traceId).toEqual(expect.any(String));
  expect(spanId).toEqual(expect.any(String));

  expect(data.route).toBe('/external-disallowed');
  expect(data.headers?.['sentry-trace']).toBeUndefined();
  expect(data.headers?.baggage).toBeUndefined();
});
