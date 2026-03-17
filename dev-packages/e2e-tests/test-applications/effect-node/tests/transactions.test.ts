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
  expect(spans).toEqual([
    expect.objectContaining({
      description: 'test-span',
    }),
  ]);
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

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: expect.objectContaining({
          origin: 'auto.http.effect',
        }),
      }),
      spans: [
        expect.objectContaining({
          description: 'custom-effect-span',
          origin: 'auto.function.effect',
        }),
        expect.objectContaining({
          description: 'nested-span',
          origin: 'auto.function.effect',
        }),
      ],
      sdk: expect.objectContaining({
        name: 'sentry.javascript.effect',
        packages: [
          expect.objectContaining({
            name: 'npm:@sentry/effect',
          }),
          expect.objectContaining({
            name: 'npm:@sentry/node-light',
          }),
        ],
      }),
    }),
  );

  const parentSpan = transactionEvent.spans?.[0]?.span_id;
  const nestedSpan = transactionEvent.spans?.[1]?.parent_span_id;

  expect(nestedSpan).toBe(parentSpan);
});

test('Sends transaction for error route', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-node', transactionEvent => {
    return transactionEvent?.transaction === 'http.server GET';
  });

  await fetch(`${baseURL}/test-error`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('http.server GET');
});
