import { expect, test } from '@playwright/test';
import { Span } from '@sentry/types';
import axios from 'axios';
import { waitForTransaction } from '../event-proxy-server';

test('Propagates trace for outgoing http requests', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('node-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-inbound-headers'
    );
  });

  const outboundTransactionPromise = waitForTransaction('node-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-outgoing-http'
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-http`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  const outgoingHttpSpan = outboundTransaction?.spans?.find(span => span.op === 'http.client') as
    | ReturnType<Span['toJSON']>
    | undefined;

  expect(outgoingHttpSpan).toBeDefined();

  const outgoingHttpSpanId = outgoingHttpSpan?.span_id;

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
      url: 'http://localhost:3030/test-outgoing-http',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': 'http://localhost:3030/test-outgoing-http',
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/test-outgoing-http',
      'http.user_agent': 'axios/1.6.7',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-outgoing-http',
    },
    op: 'http.server',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });

  expect(inboundTransaction.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      url: 'http://localhost:3030/test-inbound-headers',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': 'http://localhost:3030/test-inbound-headers',
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/test-inbound-headers',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-inbound-headers',
    },
    op: 'http.server',
    parent_span_id: outgoingHttpSpanId,
    span_id: expect.any(String),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });
});

test('Propagates trace for outgoing fetch requests', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('node-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-inbound-headers'
    );
  });

  const outboundTransactionPromise = waitForTransaction('node-fastify-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-outgoing-fetch'
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-fetch`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  const outgoingHttpSpan = outboundTransaction?.spans?.find(span => span.op === 'http.client') as
    | ReturnType<Span['toJSON']>
    | undefined;

  expect(outgoingHttpSpan).toBeDefined();

  const outgoingHttpSpanId = outgoingHttpSpan?.span_id;

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
      url: 'http://localhost:3030/test-outgoing-fetch',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': 'http://localhost:3030/test-outgoing-fetch',
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/test-outgoing-fetch',
      'http.user_agent': 'axios/1.6.7',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-outgoing-fetch',
    },
    op: 'http.server',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });

  expect(inboundTransaction.contexts?.trace).toEqual({
    data: expect.objectContaining({
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      url: 'http://localhost:3030/test-inbound-headers',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': 'http://localhost:3030/test-inbound-headers',
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/test-inbound-headers',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-inbound-headers',
    }),
    op: 'http.server',
    parent_span_id: outgoingHttpSpanId,
    span_id: expect.any(String),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });
});
