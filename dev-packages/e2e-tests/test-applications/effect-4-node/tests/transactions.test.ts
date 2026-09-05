import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an HTTP transaction', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-4-node', transactionEvent => {
    return transactionEvent?.transaction === 'http.server GET';
  });

  await fetch(`${baseURL}/test-success`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('http.server GET');
});

test('Sends transaction with manual Effect span', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-4-node', transactionEvent => {
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
  const transactionEventPromise = waitForTransaction('effect-4-node', transactionEvent => {
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
          op: 'http.server',
          origin: 'auto.http.effect',
        }),
      }),
      spans: [
        expect.objectContaining({
          description: 'custom-effect-span',
          op: 'function',
          origin: 'auto.function.effect',
        }),
        expect.objectContaining({
          description: 'nested-span',
          op: 'function',
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
            name: 'npm:@sentry/node',
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
  const transactionEventPromise = waitForTransaction('effect-4-node', transactionEvent => {
    return transactionEvent?.transaction === 'http.server GET';
  });

  await fetch(`${baseURL}/test-error`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('http.server GET');
});

test('Sends a root: true span as its own transaction in a new trace', async ({ baseURL }) => {
  const requestTransactionPromise = waitForTransaction('effect-4-node', transactionEvent => {
    return !!transactionEvent?.spans?.some(span => span.description === 'root-span-request-marker');
  });
  const detachedTransactionPromise = waitForTransaction('effect-4-node', transactionEvent => {
    return transactionEvent?.transaction === 'detached-root-span';
  });

  await fetch(`${baseURL}/test-root-span`);

  const [requestTransaction, detachedTransaction] = await Promise.all([
    requestTransactionPromise,
    detachedTransactionPromise,
  ]);

  expect(requestTransaction.transaction).toBe('http.server GET');
  expect(requestTransaction.spans?.map(span => span.description)).toEqual(['root-span-request-marker']);

  expect(detachedTransaction.contexts?.trace?.parent_span_id).toBeUndefined();
  expect(detachedTransaction.contexts?.trace?.trace_id).not.toBe(requestTransaction.contexts?.trace?.trace_id);
});

test('Continues the trace of a Tracer.externalSpan parent', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('effect-4-node', transactionEvent => {
    return transactionEvent?.transaction === 'continued-span';
  });

  await fetch(`${baseURL}/test-external-parent`);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({
      trace_id: 'fedcba0987654321fedcba0987654321',
      parent_span_id: '0987654321fedcba',
    }),
  );
});

test('Continues the trace of an incoming traceparent header', async ({ baseURL }) => {
  const traceId = '1234567890abcdef1234567890abcdef';
  const parentSpanId = 'abcdef1234567890';

  const transactionEventPromise = waitForTransaction('effect-4-node', transactionEvent => {
    return transactionEvent?.contexts?.trace?.trace_id === traceId;
  });

  await fetch(`${baseURL}/test-success`, { headers: { traceparent: `00-${traceId}-${parentSpanId}-01` } });

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent.transaction).toBe('http.server GET');
  expect(transactionEvent.contexts?.trace).toEqual(
    expect.objectContaining({ trace_id: traceId, parent_span_id: parentSpanId }),
  );
});
