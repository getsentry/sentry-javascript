import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an HTTP transaction', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-node', transactionEvent => {
    return transactionEvent?.transaction === 'http.server GET';
  });

  await fetch(`${baseURL}/test-success`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('http.server GET');
});

test('Sends transaction with manual Effect span', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-node', transactionEvent => {
    return (
      transactionEvent?.transaction === 'http.server GET' &&
      transactionEvent?.spans?.some(span => span.description === 'test-span')
    );
  });

  await fetch(`${baseURL}/test-transaction`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('http.server GET');

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
      transactionEvent?.transaction === 'http.server GET' &&
      transactionEvent?.spans?.some(span => span.description === 'custom-effect-span')
    );
  });

  await fetch(`${baseURL}/test-effect-span`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('http.server GET');

  const spans = transactionEvent.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: 'custom-effect-span',
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
    return transactionEvent?.transaction === 'http.server GET';
  });

  await fetch(`${baseURL}/test-error`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('http.server GET');
});
