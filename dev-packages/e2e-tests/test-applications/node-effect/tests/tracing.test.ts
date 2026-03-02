import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an Effect span as a Sentry transaction', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-effect', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-effect-span'
    );
  });

  await fetch(`${baseURL}/test-effect-span`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /test-effect-span');

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'test-effect-span',
      op: 'internal',
      origin: 'manual',
      status: 'ok',
    }),
  );
});

test('Captures nested Effect spans correctly', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-effect', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-nested-spans'
    );
  });

  await fetch(`${baseURL}/test-nested-spans`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');
  expect(transactionEvent.transaction).toEqual('GET /test-nested-spans');

  const spans = transactionEvent.spans || [];

  const outerSpan = spans.find(span => span.description === 'outer-span');
  const innerSpan = spans.find(span => span.description === 'inner-span');

  expect(outerSpan).toBeDefined();
  expect(innerSpan).toBeDefined();

  expect(outerSpan).toMatchObject({
    description: 'outer-span',
    op: 'internal',
    status: 'ok',
  });

  expect(innerSpan).toMatchObject({
    description: 'inner-span',
    op: 'internal',
    status: 'ok',
  });

  expect(innerSpan?.parent_span_id).toEqual(outerSpan?.span_id);
});

test('Captures Effect span error status correctly', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-effect', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-effect-error'
    );
  });

  await fetch(`${baseURL}/test-effect-error`);

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  const errorSpan = spans.find(span => span.description === 'error-span');

  expect(errorSpan).toBeDefined();
  expect(errorSpan).toMatchObject({
    description: 'error-span',
    op: 'internal',
    status: 'internal_error',
  });
});

test('Effect server spans attach to existing HTTP server span', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-effect', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-effect-with-http'
    );
  });

  await fetch(`${baseURL}/test-effect-with-http`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toEqual('http.server');

  const spans = transactionEvent.spans || [];

  const processSpan = spans.find(span => span.description === 'process-request');
  expect(processSpan).toBeUndefined();
});
