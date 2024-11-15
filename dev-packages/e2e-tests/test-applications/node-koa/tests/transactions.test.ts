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
    },
    op: 'http.server',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
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
        'koa.type': 'middleware',
        'sentry.op': 'middleware.koa',
        'sentry.origin': 'auto.http.otel.koa',
      },
      description: 'bodyParser',
      op: 'middleware.koa',
      origin: 'auto.http.otel.koa',
      parent_span_id: expect.any(String),
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
    },
    {
      data: {
        'koa.name': '',
        'koa.type': 'middleware',
        'sentry.origin': 'auto.http.otel.koa',
        'sentry.op': 'middleware.koa',
      },
      op: 'middleware.koa',
      origin: 'auto.http.otel.koa',
      description: '< unknown >',
      parent_span_id: expect.any(String),
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
    },
    {
      data: {
        'http.route': '/test-transaction',
        'koa.name': '/test-transaction',
        'koa.type': 'router',
        'sentry.origin': 'auto.http.otel.koa',
        'sentry.op': 'router.koa',
      },
      op: 'router.koa',
      description: '/test-transaction',
      parent_span_id: expect.any(String),
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
      origin: 'auto.http.otel.koa',
    },
    {
      data: {
        'sentry.origin': 'manual',
      },
      description: 'test-span',
      parent_span_id: expect.any(String),
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
      origin: 'manual',
    },
    {
      data: {
        'sentry.origin': 'manual',
      },
      description: 'child-span',
      parent_span_id: expect.any(String),
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
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

  expect(transactionEvent.user).toEqual(undefined);
});
