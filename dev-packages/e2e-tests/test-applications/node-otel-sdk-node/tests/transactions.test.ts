import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends an express transaction from its own instrumentation', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-otel-sdk-node', transactionEvent => {
    return transactionEvent.transaction === 'GET /test-transaction';
  });

  await fetch(`${baseURL}/test-transaction`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      op: 'http.server',
      origin: 'auto.http.http_server',
      status: 'ok',
      data: expect.objectContaining({
        'http.route': '/test-transaction',
        'sentry.segment.name.source': 'route',
      }),
    }),
  );

  expect(transactionEvent.transaction_info).toEqual({ source: 'route' });

  const spanDescriptions = (transactionEvent.spans || []).map(span => span.description);

  expect(spanDescriptions).toContain('sentry-span');
  // The user's OpenTelemetry spans belong to their pipeline, so they must not end up in Sentry.
  expect(spanDescriptions).not.toContain('otel-span');
});

test('parameterizes express routes', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-otel-sdk-node', transactionEvent => {
    return transactionEvent.transaction === 'GET /test-param/:param';
  });

  await fetch(`${baseURL}/test-param/123`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.data).toEqual(
    expect.objectContaining({ 'http.route': '/test-param/:param' }),
  );
});
