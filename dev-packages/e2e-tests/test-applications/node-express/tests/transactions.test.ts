import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an API route transaction', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-express', transactionEvent => {
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
      'http.host': 'localhost:3030',
      'server.address': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/test-transaction',
      'http.user_agent': 'node',
      'http.flavor': '1.1',
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

  expect(transactionEvent.contexts?.response).toEqual({
    status_code: 200,
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

  // Manually started span
  expect(spans).toContainEqual({
    data: { 'sentry.origin': 'manual' },
    description: 'test-span',
    origin: 'manual',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  // auto instrumented spans
  expect(spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'middleware',
      'express.name': 'query',
      'express.type': 'middleware',
    },
    description: 'query',
    op: 'middleware',
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
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'middleware',
      'express.name': 'expressInit',
      'express.type': 'middleware',
    },
    description: 'expressInit',
    op: 'middleware',
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
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'handler',
      'http.route': '/test-transaction',
      'express.name': '/test-transaction',
      'express.type': 'request_handler',
    },
    description: '/test-transaction',
    op: 'handler',
    origin: 'auto.http.express',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });
});

test('Sends an API route transaction for an errored route', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /test-exception/:id' &&
      transactionEvent.request?.url === 'http://localhost:3030/test-exception/777'
    );
  });

  await fetch(`${baseURL}/test-exception/777`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /test-exception/:id');
  expect(transactionEvent.contexts?.trace?.status).toEqual('internal_error');
  expect(transactionEvent.contexts?.trace?.data?.['http.status_code']).toEqual(500);

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual({
    data: {
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'middleware',
      'express.name': 'query',
      'express.type': 'middleware',
    },
    description: 'query',
    op: 'middleware',
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
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'middleware',
      'express.name': 'expressInit',
      'express.type': 'middleware',
    },
    description: 'expressInit',
    op: 'middleware',
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
      'sentry.origin': 'auto.http.express',
      'sentry.op': 'handler',
      'http.route': '/test-exception/:id',
      'express.name': '/test-exception/:id',
      'express.type': 'request_handler',
      'error.type': 'Error',
    },
    description: '/test-exception/:id',
    op: 'handler',
    origin: 'auto.http.express',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    status: 'internal_error',
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });
});

test('Outgoing fetch spans include response headers when headersToSpanAttributes is configured', async ({
  baseURL,
}) => {
  const transactionEventPromise = waitForTransaction('node-express', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-outgoing-fetch'
    );
  });

  await fetch(`${baseURL}/test-outgoing-fetch`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  // Find the outgoing fetch span (http.client operation from undici instrumentation)
  const fetchSpan = spans.find(
    span => span.op === 'http.client' && span.description?.includes('localhost:3030/test-success'),
  );

  expect(fetchSpan).toBeDefined();
  expect(fetchSpan?.data).toEqual(
    expect.objectContaining({
      'http.response.header.content-length': [expect.any(String)],
    }),
  );
});

test('Extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  await fetch(`${baseURL}/test-transaction`, {
    headers: {
      'User-Agent': 'Custom-Agent/1.0 (Test)',
      'Content-Type': 'application/json',
      'X-Custom-Header': 'test-value',
      Accept: 'application/json, text/plain',
      'X-Request-ID': 'req-123',
    },
  });

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'http.request.header.user_agent': 'Custom-Agent/1.0 (Test)',
      'http.request.header.content_type': 'application/json',
      'http.request.header.x_custom_header': 'test-value',
      'http.request.header.accept': 'application/json, text/plain',
      'http.request.header.x_request_id': 'req-123',
    }),
  );
});
