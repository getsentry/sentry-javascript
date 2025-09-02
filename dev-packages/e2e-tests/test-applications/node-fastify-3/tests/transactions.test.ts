import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an API route transaction', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-fastify-3', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  await fetch(`${baseURL}/test-transaction`);

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      url: 'http://localhost:3030/test-transaction',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': 'http://localhost:3030/test-transaction',
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/test-transaction',
      'http.user_agent': 'node',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-transaction',
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
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.otel.http',
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /test-transaction',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual({
    data: {
      'plugin.name': 'sentry-fastify-error-handler',
      'fastify.type': 'request_handler',
      'http.route': '/test-transaction',
      'sentry.origin': 'auto.http.otel.fastify',
      'sentry.op': 'request_handler.fastify',
    },
    description: 'sentry-fastify-error-handler',
    op: 'request_handler.fastify',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.otel.fastify',
  });

  expect(spans).toContainEqual({
    data: {
      'plugin.name': 'sentry-fastify-error-handler',
      'fastify.type': 'request_handler',
      'http.route': '/test-transaction',
      'sentry.op': 'request_handler.fastify',
      'sentry.origin': 'auto.http.otel.fastify',
    },
    description: 'sentry-fastify-error-handler',
    op: 'request_handler.fastify',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.otel.fastify',
  });

  expect(spans).toContainEqual({
    data: {
      'sentry.origin': 'manual',
    },
    description: 'test-span',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'manual',
  });

  expect(spans).toContainEqual({
    data: {
      'sentry.origin': 'manual',
    },
    description: 'child-span',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'manual',
  });
});

test('Captures request metadata', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-fastify-3', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'POST /test-post'
    );
  });

  const res = await fetch(`${baseURL}/test-post`, {
    method: 'POST',
    body: JSON.stringify({ foo: 'bar', other: 1 }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const resBody = await res.json();

  expect(resBody).toEqual({ status: 'ok', body: { foo: 'bar', other: 1 } });

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.request).toEqual({
    cookies: {},
    url: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/),
    method: 'POST',
    headers: expect.objectContaining({
      'user-agent': expect.stringContaining(''),
      'content-type': 'application/json',
    }),
    data: JSON.stringify({
      foo: 'bar',
      other: 1,
    }),
  });

  expect(transactionEvent.user).toEqual(undefined);
});
