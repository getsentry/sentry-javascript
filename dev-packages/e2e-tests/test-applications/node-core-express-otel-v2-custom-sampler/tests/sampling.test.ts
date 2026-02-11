import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a sampled API route transaction', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-core-express-otel-v2-custom-sampler', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /task';
  });

  await fetch(`${baseURL}/task`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    data: {
      'sentry.source': 'url',
      'sentry.op': 'http.server',
      'sentry.origin': 'manual',
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
    },
    origin: 'manual',
    op: 'http.server',
    status: 'ok',
  });

  expect(transactionEvent.spans?.length).toBe(1);

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
  const unsampledTransactionEventPromise = waitForTransaction(
    'node-core-express-otel-v2-custom-sampler',
    transactionEvent => {
      return (
        transactionEvent?.contexts?.trace?.op === 'http.server' &&
        transactionEvent?.transaction === 'GET /unsampled/task'
      );
    },
  );

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
