import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an HTTP transaction', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs-microservices', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  const response = await fetch(`${baseURL}/test-transaction`);
  expect(response.status).toBe(200);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      op: 'http.server',
      status: 'ok',
    }),
  );
});

// Trace context does not propagate over NestJS TCP transport.
// The manual span created inside the microservice handler is orphaned, not a child of the HTTP transaction.
// This test documents this gap — if trace propagation is ever fixed, test.fail() will alert us.
test.fail('Microservice spans are captured as children of the HTTP transaction', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs-microservices', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-microservice-sum'
    );
  });

  const response = await fetch(`${baseURL}/test-microservice-sum`);
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.result).toBe(6);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      op: 'http.server',
      status: 'ok',
    }),
  );

  const microserviceSpan = transactionEvent.spans?.find(span => span.description === 'microservice-sum-operation');
  expect(microserviceSpan).toBeDefined();
  expect(microserviceSpan.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);
});
