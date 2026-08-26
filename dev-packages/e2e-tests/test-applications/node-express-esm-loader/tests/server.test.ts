import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should record exceptions captured inside handlers', async ({ request }) => {
  const errorEventPromise = waitForError('node-express-esm-loader', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('This is an error');
  });

  await request.get('/test-error');

  await expect(errorEventPromise).resolves.toBeDefined();
});

test('Should record a transaction for a parameterless route', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('node-express-esm-loader', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-success';
  });

  await request.get('/test-success');

  await expect(transactionEventPromise).resolves.toBeDefined();
});

test('Should record a transaction for route with parameters', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('node-express-esm-loader', transactionEvent => {
    return transactionEvent.contexts?.trace?.data?.['url.path'] === '/test-transaction/1';
  });

  await request.get('/test-transaction/1');

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.transaction).toEqual('GET /test-transaction/:param');
  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'http.route': '/test-transaction/:param',
      'url.scheme': 'http',
      'http.response.status_text': 'OK',
      'url.full': 'http://localhost:3030/test-transaction/1',
      'user_agent.original': expect.any(String),
      'network.local.address': expect.any(String),
      'server.address': 'localhost',
      'network.local.port': 3030,
      'network.peer.address': expect.any(String),
      'network.peer.port': expect.any(Number),
      'network.transport': 'tcp',
      'sentry.kind': 'server',
      'sentry.op': 'http.server',
      'sentry.origin': 'auto.http',
      'sentry.sample_rate': 1,
      'sentry.segment.name.source': 'route',
    }),
  );

  const spans = transactionEvent.spans || [];
  expect(spans).toContainEqual({
    data: {
      'express.name': 'query',
      'express.type': 'middleware',
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'middleware',
    },
    op: 'middleware',
    description: 'query',
    origin: 'auto.http.express',
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
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'middleware',
    },
    op: 'middleware',
    description: 'expressInit',
    origin: 'auto.http.express',
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
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'handler',
    },
    op: 'handler',
    description: '/test-transaction/:param',
    origin: 'auto.http.express',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });
});

test('Instruments MySQL via Orchestrion', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express-esm-loader', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /test-mysql';
  });

  await fetch(`${baseURL}/test-mysql`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /test-mysql');
  expect(transactionEvent.contexts?.trace?.status).toEqual('ok');
  expect(transactionEvent.contexts?.trace?.data?.['http.response.status_code']).toEqual(200);

  const spans = transactionEvent.spans || [];
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql',
      description: 'SELECT 1 + 1 AS solution',
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.mysql',
      description: 'SELECT NOW()',
    }),
  );
});
