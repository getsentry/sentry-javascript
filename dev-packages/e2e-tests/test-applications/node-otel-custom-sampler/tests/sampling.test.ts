import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a sampled API route transaction', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-otel-custom-sampler', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /task';
  });

  await fetch(`${baseURL}/task`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    data: {
      'sentry.source': 'route',
      'sentry.op': 'http.server',
      'sentry.origin': 'auto.http.otel.http',
      url: 'http://localhost:3030/task',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': 'http://localhost:3030/task',
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/task',
      'http.user_agent': 'node',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': 3030,
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/task',
      'http.request.header.accept': '*/*',
      'http.request.header.accept_encoding': 'gzip, deflate',
      'http.request.header.accept_language': '*',
      'http.request.header.connection': 'keep-alive',
      'http.request.header.host': expect.any(String),
      'http.request.header.sec_fetch_mode': 'cors',
      'http.request.header.user_agent': 'node',
    },
    origin: 'auto.http.otel.http',
    op: 'http.server',
    status: 'ok',
  });

  expect(transactionEvent.spans?.length).toBe(4);

  expect(transactionEvent.spans).toContainEqual({
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    data: {
      'sentry.origin': 'auto.http.otel.express',
      'sentry.op': 'middleware.express',
      'express.name': 'query',
      'express.type': 'middleware',
    },
    description: 'query',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    status: 'ok',
    op: 'middleware.express',
    origin: 'auto.http.otel.express',
  });

  expect(transactionEvent.spans).toContainEqual({
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    data: {
      'sentry.origin': 'auto.http.otel.express',
      'sentry.op': 'middleware.express',
      'express.name': 'expressInit',
      'express.type': 'middleware',
    },
    description: 'expressInit',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    status: 'ok',
    op: 'middleware.express',
    origin: 'auto.http.otel.express',
  });

  expect(transactionEvent.spans).toContainEqual({
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    data: {
      'sentry.origin': 'auto.http.otel.express',
      'sentry.op': 'request_handler.express',
      'http.route': '/task',
      'express.name': '/task',
      'express.type': 'request_handler',
    },
    description: '/task',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    status: 'ok',
    op: 'request_handler.express',
    origin: 'auto.http.otel.express',
  });

  expect(transactionEvent.spans).toContainEqual({
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    data: {
      'sentry.origin': 'manual',
      'sentry.op': 'custom.op',
    },
    description: 'Long task',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    status: 'ok',
    op: 'custom.op',
    origin: 'manual',
  });
});

test('Does not send an unsampled API route transaction', async ({ baseURL }) => {
  const unsampledTransactionEventPromise = waitForTransaction('node-otel-custom-sampler', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /unsampled/task'
    );
  });

  await fetch(`${baseURL}/unsampled/task`);

  const promiseShouldNotResolve = () =>
    new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // Test passes because promise did not resolve within timeout
      }, 1000);

      unsampledTransactionEventPromise.then(
        () => {
          clearTimeout(timeout);
          reject(new Error('Promise should not have resolved'));
        },
        () => {
          clearTimeout(timeout);
          reject(new Error('Promise should not have been rejected'));
        },
      );
    });

  expect(promiseShouldNotResolve()).resolves.not.toThrow();
});
