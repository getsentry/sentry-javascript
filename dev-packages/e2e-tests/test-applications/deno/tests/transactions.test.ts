import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends transaction with Sentry.startSpan', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno', event => {
    return event?.spans?.some(span => span.description === 'test-sentry-span') ?? false;
  });

  await fetch(`${baseURL}/test-sentry-span`);

  const transaction = await transactionPromise;

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'test-sentry-span',
        origin: 'manual',
      }),
    ]),
  );
});

test('Sends transaction with OTel tracer.startSpan despite pre-existing provider', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno', event => {
    return event?.spans?.some(span => span.description === 'test-otel-span') ?? false;
  });

  await fetch(`${baseURL}/test-otel-span`);

  const transaction = await transactionPromise;

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'test-otel-span',
        op: 'otel.span',
        origin: 'manual',
      }),
    ]),
  );
});

test('Sends transaction with OTel tracer.startActiveSpan', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno', event => {
    return event?.spans?.some(span => span.description === 'test-otel-active-span') ?? false;
  });

  await fetch(`${baseURL}/test-otel-active-span`);

  const transaction = await transactionPromise;

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'test-otel-active-span',
        op: 'otel.span',
        origin: 'manual',
      }),
    ]),
  );
});

test('OTel span appears as child of Sentry span (interop)', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno', event => {
    return event?.spans?.some(span => span.description === 'sentry-parent') ?? false;
  });

  await fetch(`${baseURL}/test-interop`);

  const transaction = await transactionPromise;

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'sentry-parent',
        origin: 'manual',
      }),
      expect.objectContaining({
        description: 'otel-child',
        op: 'otel.span',
        origin: 'manual',
      }),
    ]),
  );

  // Verify the OTel span is a child of the Sentry span
  const sentrySpan = transaction.spans!.find((s: any) => s.description === 'sentry-parent');
  const otelSpan = transaction.spans!.find((s: any) => s.description === 'otel-child');
  expect(otelSpan!.parent_span_id).toBe(sentrySpan!.span_id);
});
