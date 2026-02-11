import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should record exceptions captured inside handlers', async ({ request }) => {
  const errorEventPromise = waitForError('node-express-esm-preload', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('This is an error');
  });

  await request.get('/test-error');

  await expect(errorEventPromise).resolves.toBeDefined();
});

test('Should record a transaction for a parameterless route', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('node-express-esm-preload', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-success';
  });

  await request.get('/test-success');

  await expect(transactionEventPromise).resolves.toBeDefined();
});

test('Should record a transaction for route with parameters', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('node-express-esm-preload', transactionEvent => {
    return transactionEvent.contexts?.trace?.data?.['http.target'] === '/test-transaction/1';
  });

  await request.get('/test-transaction/1');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.transaction).toEqual('GET /test-transaction/:param');
  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'http.flavor': '1.1',
      'http.host': 'localhost:3030',
      'http.method': 'GET',
      'http.response.status_code': 200,
      'http.route': '/test-transaction/:param',
      'http.scheme': 'http',
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.target': '/test-transaction/1',
      'http.url': 'http://localhost:3030/test-transaction/1',
      'http.user_agent': expect.any(String),
      'net.host.ip': expect.any(String),
      'net.host.name': 'localhost',
      'net.host.port': 3030,
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'net.transport': 'ip_tcp',
      'otel.kind': 'SERVER',
      'sentry.op': 'http.server',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
      url: 'http://localhost:3030/test-transaction/1',
    }),
  );

  const spans = transactionEvent.spans || [];
  expect(spans).toContainEqual({
    data: {
      'express.name': 'query',
      'express.type': 'middleware',
      'sentry.origin': 'auto.http.otel.express',
      'sentry.op': 'middleware.express',
    },
    op: 'middleware.express',
    description: 'query',
    origin: 'auto.http.otel.express',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(spans).toContainEqual({
    data: {
      'express.name': 'expressInit',
      'express.type': 'middleware',
      'sentry.origin': 'auto.http.otel.express',
      'sentry.op': 'middleware.express',
    },
    op: 'middleware.express',
    description: 'expressInit',
    origin: 'auto.http.otel.express',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(spans).toContainEqual({
    data: {
      'express.name': '/test-transaction/:param',
      'express.type': 'request_handler',
      'http.route': '/test-transaction/:param',
      'sentry.origin': 'auto.http.otel.express',
      'sentry.op': 'request_handler.express',
    },
    op: 'request_handler.express',
    description: '/test-transaction/:param',
    origin: 'auto.http.otel.express',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });
});

test('Should record spans from http instrumentation', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('node-express-esm-preload', transactionEvent => {
    return transactionEvent.contexts?.trace?.data?.['http.target'] === '/http-req';
  });

  await request.get('/http-req');

  const transactionEvent = await transactionEventPromise;

  const httpClientSpan = transactionEvent.spans?.find(span => span.op === 'http.client');

  expect(httpClientSpan).toEqual({
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    data: expect.objectContaining({
      'http.flavor': '1.1',
      'http.host': 'example.com:80',
      'http.method': 'GET',
      'http.response.status_code': 200,
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.target': '/',
      'http.url': 'http://example.com/',
      'net.peer.ip': expect.any(String),
      'net.peer.name': 'example.com',
      'net.peer.port': 80,
      'net.transport': 'ip_tcp',
      'otel.kind': 'CLIENT',
      'sentry.op': 'http.client',
      'sentry.origin': 'auto.http.otel.http',
      url: 'http://example.com/',
    }),
    description: 'GET http://example.com/',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    status: 'ok',
    op: 'http.client',
    origin: 'auto.http.otel.http',
  });
});
