import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { type SpanJSON } from '@sentry/core';

const APP_NAME = 'hono-4';

test('creates a span for named middleware', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-middleware/named';
  });

  const response = await fetch(`${baseURL}/test-middleware/named`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  const spans = transaction.spans || [];

  const middlewareSpan = spans.find(
    (span: { description?: string; op?: string }) =>
      span.op === 'middleware.hono' && span.description === 'middlewareA',
  );

  expect(middlewareSpan).toEqual(
    expect.objectContaining({
      description: 'middlewareA',
      op: 'middleware.hono',
      origin: 'auto.middleware.hono',
      status: 'ok',
    }),
  );

  // The middleware has a 50ms delay, so the span duration should be at least 50ms (0.05s)
  // @ts-expect-error timestamp is defined
  const durationMs = (middlewareSpan?.timestamp - middlewareSpan?.start_timestamp) * 1000;
  expect(durationMs).toBeGreaterThanOrEqual(50);
});

test('creates a span for anonymous middleware', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-middleware/anonymous';
  });

  const response = await fetch(`${baseURL}/test-middleware/anonymous`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  const spans = transaction.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      description: '<anonymous>',
      op: 'middleware.hono',
      origin: 'auto.middleware.hono',
      status: 'ok',
    }),
  );
});

test('multiple middleware are sibling spans under the same parent', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-middleware/multi';
  });

  const response = await fetch(`${baseURL}/test-middleware/multi`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  const spans = transaction.spans || [];

  // Sort spans because they are in a different order in Node/Bun (OTel-based)
  const middlewareSpans = spans
    .filter((span: SpanJSON) => span.op === 'middleware.hono' && span.origin === 'auto.middleware.hono')
    .sort((a, b) => (a.start_timestamp ?? 0) - (b.start_timestamp ?? 0));

  expect(middlewareSpans).toHaveLength(2);
  expect(middlewareSpans[0]?.description).toBe('middlewareA');
  expect(middlewareSpans[1]?.description).toBe('middlewareB');

  // Both middleware spans share the same parent (siblings, not nested)
  expect(middlewareSpans[0]?.parent_span_id).toBe(middlewareSpans[1]?.parent_span_id);

  // middlewareA has a 50ms delay, middlewareB has a 60ms delay
  // @ts-expect-error timestamp is defined
  const timestampDurationMs = (middlewareSpans[0]?.timestamp - middlewareSpans[0]?.start_timestamp) * 1000;
  // @ts-expect-error timestamp is defined
  const authDurationMs = (middlewareSpans[1]?.timestamp - middlewareSpans[1]?.start_timestamp) * 1000;
  expect(timestampDurationMs).toBeGreaterThanOrEqual(50);
  expect(authDurationMs).toBeGreaterThanOrEqual(60);
});

test('captures error thrown in middleware', async ({ baseURL }) => {
  const errorPromise = waitForError(APP_NAME, event => {
    return event.exception?.values?.[0]?.value === 'Middleware error';
  });

  const response = await fetch(`${baseURL}/test-middleware/error`);
  expect(response.status).toBe(500);

  const errorEvent = await errorPromise;
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Middleware error');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
    expect.objectContaining({
      handled: false,
      type: 'auto.middleware.hono',
    }),
  );
});

test('sets error status on middleware span when middleware throws', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-middleware/error/*';
  });

  await fetch(`${baseURL}/test-middleware/error`);

  const transaction = await transactionPromise;
  const spans = transaction.spans || [];

  const failingSpan = spans.find(
    (span: { description?: string; op?: string }) =>
      span.op === 'middleware.hono' && span.description === 'failingMiddleware',
  );

  expect(failingSpan).toBeDefined();
  expect(failingSpan?.status).toBe('internal_error');
  expect(failingSpan?.origin).toBe('auto.middleware.hono');
});

test('includes request data on error events from middleware', async ({ baseURL }) => {
  const errorPromise = waitForError(APP_NAME, event => {
    return event.exception?.values?.[0]?.value === 'Middleware error';
  });

  await fetch(`${baseURL}/test-middleware/error`);

  const errorEvent = await errorPromise;
  expect(errorEvent.request).toEqual(
    expect.objectContaining({
      method: 'GET',
      url: expect.stringContaining('/test-middleware/error'),
    }),
  );
});
