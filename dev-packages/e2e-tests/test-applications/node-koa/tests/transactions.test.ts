import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an API route transaction', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-koa', transactionEvent => {
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
      'sentry.kind': 'server',
      'http.response.status_code': 200,
      'url.full': 'http://localhost:3030/test-transaction',
      'url.path': '/test-transaction',
      'server.address': 'localhost',
      'http.request.method': 'GET',
      'url.scheme': 'http',
      'user_agent.original': 'node',
      'client.address': '::1',
      'client.port': expect.any(Number),
      'network.transport': 'tcp',
      'network.local.address': expect.any(String),
      'network.local.port': expect.any(Number),
      'network.peer.address': expect.any(String),
      'network.peer.port': expect.any(Number),
      'network.protocol.name': 'http',
      'network.protocol.version': '1.1',
      'server.port': 3030,
      'http.response.status_text': 'OK',
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

  expect(transactionEvent).toMatchObject({
    transaction: 'GET /test-transaction',
    type: 'transaction',
    transaction_info: {
      source: 'route',
    },
  });

  expect(transactionEvent.spans).toEqual([
    {
      data: {
        'koa.name': 'bodyParser',
        'code.function.name': 'bodyParser',
        'koa.type': 'middleware',
        'sentry.op': 'middleware',
        'sentry.origin': 'auto.http.koa',
      },
      description: 'bodyParser',
      op: 'middleware',
      origin: 'auto.http.koa',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    },
    {
      data: {
        'koa.name': 'middleware',
        'code.function.name': 'middleware',
        'koa.type': 'middleware',
        'sentry.origin': 'auto.http.koa',
        'sentry.op': 'middleware',
      },
      op: 'middleware',
      origin: 'auto.http.koa',
      description: 'middleware',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    },
    {
      data: {
        'http.route': '/test-transaction',
        'koa.name': '/test-transaction',
        'koa.type': 'router',
        'sentry.origin': 'auto.http.koa',
        'sentry.op': 'router',
      },
      op: 'router',
      description: '/test-transaction',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      origin: 'auto.http.koa',
    },
    {
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
    },
    {
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
    },
  ]);
});

test('Captures request metadata', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-koa', transactionEvent => {
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

  expect(transactionEvent.user).toEqual({ ip_address: '::1' });
});
