import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends successful transaction', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /test-success'
    );
  });

  await fetch(`${baseURL}/test-success`);

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'sentry.segment.name.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      'sentry.kind': 'server',
      'http.response.status_code': 200,
      'url.full': 'http://localhost:3030/test-success',
      'url.path': '/test-success',
      'server.address': 'localhost',
      'http.request.method': 'GET',
      'url.scheme': 'http',
      'http.target': '/test-success',
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
      'http.route': '/test-success',
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
      transaction: 'GET /test-success',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );

  const spans = transactionEvent.spans || [];

  spans.forEach(span => {
    expect(Object.keys(span.data).some(key => key.startsWith('http.request.header.'))).toBe(false);
  });

  expect(spans).toEqual([
    {
      data: {
        'hapi.type': 'router',
        'http.request.method': 'GET',
        'http.route': '/test-success',
        'sentry.op': 'router',
        'sentry.origin': 'auto.http.hapi',
      },
      description: 'GET /test-success',
      op: 'router',
      origin: 'auto.http.hapi',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    },
    {
      // this comes from "onPreResponse"
      data: {
        'hapi.type': 'server.ext',
        'sentry.op': 'middleware',
        'sentry.origin': 'auto.http.hapi',
        'server.ext.type': 'onPreResponse',
      },
      description: 'ext - onPreResponse',
      op: 'middleware',
      origin: 'auto.http.hapi',
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    },
  ]);
});

test('Sends parameterized transactions to Sentry', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-param/{param}'
    );
  });

  await fetch(`${baseURL}/test-param/123`);

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent?.contexts?.trace?.op).toBe('http.server');
  expect(transactionEvent?.contexts?.trace?.data?.['http.route']).toBe('/test-param/{param}');
  expect(transactionEvent?.transaction).toBe('GET /test-param/{param}');
});

test('Isolates requests', async ({ baseURL }) => {
  const transaction1Promise = waitForTransaction('node-hapi', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.contexts?.trace?.data?.['http.target'] === '/test-param/888'
    );
  });
  const transaction2Promise = waitForTransaction('node-hapi', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.contexts?.trace?.data?.['http.target'] === '/test-param/999'
    );
  });

  await Promise.all([fetch(`${baseURL}/test-param/888`), fetch(`${baseURL}/test-param/999`)]);

  const transaction1 = await transaction1Promise;
  const transaction2 = await transaction2Promise;

  expect(transaction1.tags).toEqual({ 'param-888': 'yes' });
  expect(transaction2.tags).toEqual({ 'param-999': 'yes' });
});
