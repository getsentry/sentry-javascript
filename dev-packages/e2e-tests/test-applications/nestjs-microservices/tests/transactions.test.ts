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

// Trace context does not propagate over NestJS TCP transport, so RPC spans are disconnected from
// the HTTP transaction. Instead of appearing as child spans of the HTTP transaction, auto-instrumented
// NestJS guard/interceptor/pipe spans become separate standalone transactions.
// This documents the current (broken) behavior — ideally these should be connected to the HTTP trace.

test('Microservice spans are not connected to the HTTP transaction', async ({ baseURL }) => {
  const httpTransactionPromise = waitForTransaction('nestjs-microservices', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-microservice-sum'
    );
  });

  const response = await fetch(`${baseURL}/test-microservice-sum`);
  expect(response.status).toBe(200);

  const httpTransaction = await httpTransactionPromise;

  // The microservice span should be part of this transaction but isn't due to missing trace propagation
  const microserviceSpan = httpTransaction.spans?.find(span => span.description === 'microservice-sum-operation');
  expect(microserviceSpan).toBeUndefined();
});

test('Microservice guard is emitted as a standalone transaction instead of being part of the HTTP trace', async ({
  baseURL,
}) => {
  const guardTransactionPromise = waitForTransaction('nestjs-microservices', transactionEvent => {
    return transactionEvent?.transaction === 'ExampleGuard';
  });

  await fetch(`${baseURL}/test-microservice-guard`);

  const guardTransaction = await guardTransactionPromise;
  expect(guardTransaction).toBeDefined();
});

test('Microservice interceptor is emitted as a standalone transaction instead of being part of the HTTP trace', async ({
  baseURL,
}) => {
  const interceptorTransactionPromise = waitForTransaction('nestjs-microservices', transactionEvent => {
    return transactionEvent?.transaction === 'ExampleInterceptor';
  });

  await fetch(`${baseURL}/test-microservice-interceptor`);

  const interceptorTransaction = await interceptorTransactionPromise;
  expect(interceptorTransaction).toBeDefined();
});

test('Microservice pipe is emitted as a standalone transaction instead of being part of the HTTP trace', async ({
  baseURL,
}) => {
  const pipeTransactionPromise = waitForTransaction('nestjs-microservices', transactionEvent => {
    return transactionEvent?.transaction === 'ExamplePipe';
  });

  await fetch(`${baseURL}/test-microservice-pipe`);

  const pipeTransaction = await pipeTransactionPromise;
  expect(pipeTransaction).toBeDefined();
});
