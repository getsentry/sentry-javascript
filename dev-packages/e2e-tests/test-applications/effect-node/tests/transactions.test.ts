import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an HTTP transaction', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-node', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction?.includes('/test-success')
    );
  });

  await fetch(`${baseURL}/test-success`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
  expect(transactionEvent.transaction).toContain('/test-success');
});

test('Sends transaction with manual Effect span', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-node', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction?.includes('/test-transaction')
    );
  });

  await fetch(`${baseURL}/test-transaction`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
  expect(transactionEvent.transaction).toContain('/test-transaction');

  const spans = transactionEvent.spans || [];
  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'test-span',
    }),
  );
});

test('Sends Effect spans with correct parent-child structure', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-node', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction?.includes('/test-effect-span')
    );
  });

  await fetch(`${baseURL}/test-effect-span`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
  expect(transactionEvent.transaction).toContain('/test-effect-span');

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'custom-effect-span',
      op: 'internal',
    }),
  );

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'nested-span',
    }),
  );

  const parentSpan = spans.find(s => s.description === 'custom-effect-span');
  const nestedSpan = spans.find(s => s.description === 'nested-span');
  expect(nestedSpan?.parent_span_id).toBe(parentSpan?.span_id);
});

test('Sends transaction for error route', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-node', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction?.includes('/test-error')
    );
  });

  await fetch(`${baseURL}/test-error`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
  expect(transactionEvent.transaction).toContain('/test-error');
});
