import crypto from 'crypto';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';
import { SpanJSON } from '@sentry/types';
import axios from 'axios';

test('Propagates trace for outgoing http requests', async ({ baseURL }) => {
  const id = crypto.randomUUID();

  const inboundTransactionPromise = waitForTransaction('node-koa-app', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-inbound-headers/${id}`
    );
  });

  const outboundTransactionPromise = waitForTransaction('node-koa-app', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-http/${id}`
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-http/${id}`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  const outgoingHttpSpan = outboundTransaction?.spans?.find(span => span.op === 'http.client') as SpanJSON | undefined;

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
      url: `http://localhost:3030/test-outgoing-http/${id}`,
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': `http://localhost:3030/test-outgoing-http/${id}`,
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': `/test-outgoing-http/${id}`,
      'http.user_agent': 'axios/1.6.7',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-outgoing-http/:id',
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
  const id = crypto.randomUUID();

  const inboundTransactionPromise = waitForTransaction('node-koa-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-inbound-headers/${id}`
    );
  });

  const outboundTransactionPromise = waitForTransaction('node-koa-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-fetch/${id}`
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-fetch/${id}`);

  const inboundTransaction = await inboundTransactionPromise;
  const outboundTransaction = await outboundTransactionPromise;

  const traceId = outboundTransaction?.contexts?.trace?.trace_id;
  const outgoingHttpSpan = outboundTransaction?.spans?.find(span => span.op === 'http.client') as SpanJSON | undefined;

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
      url: `http://localhost:3030/test-outgoing-fetch/${id}`,
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': `http://localhost:3030/test-outgoing-fetch/${id}`,
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': `/test-outgoing-fetch/${id}`,
      'http.user_agent': 'axios/1.6.7',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-outgoing-fetch/:id',
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
    }),
    op: 'http.server',
    parent_span_id: outgoingHttpSpanId,
    span_id: expect.any(String),
    status: 'ok',
    trace_id: traceId,
    origin: 'auto.http.otel.http',
  });
});

test('Propagates trace for outgoing external http requests', async ({ baseURL }) => {
  const inboundTransactionPromise = waitForTransaction('node-koa-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-http-external-allowed`
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-http-external-allowed`);

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
  const inboundTransactionPromise = waitForTransaction('node-koa-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-http-external-disallowed`
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-http-external-disallowed`);

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
  const inboundTransactionPromise = waitForTransaction('node-koa-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-fetch-external-allowed`
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-fetch-external-allowed`);

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
  const inboundTransactionPromise = waitForTransaction('node-koa-app', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/test-outgoing-fetch-external-disallowed`
    );
  });

  const { data } = await axios.get(`${baseURL}/test-outgoing-fetch-external-disallowed`);

  const inboundTransaction = await inboundTransactionPromise;

  const traceId = inboundTransaction?.contexts?.trace?.trace_id;
  const spanId = inboundTransaction?.spans?.find(span => span.op === 'http.client')?.span_id;

  expect(traceId).toEqual(expect.any(String));
  expect(spanId).toEqual(expect.any(String));

  expect(data.route).toBe('/external-disallowed');
  expect(data.headers?.['sentry-trace']).toBeUndefined();
  expect(data.headers?.baggage).toBeUndefined();
});
