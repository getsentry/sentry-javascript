import { expect, test } from '@playwright/test';
import { waitForPlainRequest, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an API route transaction', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-core-express-otel-v2-sdk-node', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  // Ensure we also send data to the OTLP endpoint
  const otelPromise = waitForPlainRequest('node-core-express-otel-v2-sdk-node-otel', data => {
    const json = JSON.parse(data) as any;

    return json.resourceSpans.length > 0;
  });

  await fetch(`${baseURL}/test-transaction`);

  const transactionEvent = await pageloadTransactionEventPromise;

  const otelData = await otelPromise;

  // For now we do not test the actual shape of this, but only existence
  expect(otelData).toBeDefined();

  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'url',
      'sentry.origin': 'manual',
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
    },
    op: 'http.server',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'manual',
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /test-transaction',
      type: 'transaction',
      transaction_info: {
        source: 'url',
      },
    }),
  );
});

test('Sends an API route transaction for an errored route', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-core-express-otel-v2-sdk-node', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /test-exception/777' &&
      transactionEvent.request?.url === 'http://localhost:3030/test-exception/777'
    );
  });

  await fetch(`${baseURL}/test-exception/777`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /test-exception/777');
  expect(transactionEvent.contexts?.trace?.status).toEqual('internal_error');
  expect(transactionEvent.contexts?.trace?.data?.['http.status_code']).toEqual(500);
});
