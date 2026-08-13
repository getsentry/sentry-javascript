import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('preserves a static child span that ends in waitUntil after the response', async ({ signal }) => {
  let requestTraceId: string | undefined;
  let requestSpanId: string | undefined;
  let lateTraceId: string | undefined;
  let lateParentSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      expect(envelope[1]).toHaveLength(1);
      expect(envelope[1][0]?.[0].type).toBe('transaction');

      const transaction = envelope[1][0]?.[1] as TransactionEvent;
      expect(transaction.transaction).toBe('GET /late-child');
      expect(transaction.contexts?.trace?.op).toBe('http.server');
      expect(transaction.spans).toHaveLength(0);

      requestTraceId = transaction.contexts?.trace?.trace_id;
      requestSpanId = transaction.contexts?.trace?.span_id;
    })
    .expect(envelope => {
      expect(envelope[1]).toHaveLength(1);
      expect(envelope[1][0]?.[0].type).toBe('transaction');

      const transaction = envelope[1][0]?.[1] as TransactionEvent;
      expect(transaction.transaction).toBe('late waitUntil child');
      expect(transaction.contexts?.trace?.op).toBe('test.wait_until');
      expect(transaction.contexts?.trace?.data?.['sentry.parent_span_already_sent']).toBe(true);
      expect(transaction.spans).toHaveLength(0);

      lateTraceId = transaction.contexts?.trace?.trace_id;
      lateParentSpanId = transaction.contexts?.trace?.parent_span_id;
    })
    .unordered()
    .strict()
    .start(signal);

  const response = await runner.makeRequest('get', '/late-child');
  expect(response).toBe('');
  await runner.completed();

  expect(requestTraceId).toBeDefined();
  expect(lateTraceId).toBe(requestTraceId);
  expect(requestSpanId).toBeDefined();
  expect(lateParentSpanId).toBe(requestSpanId);
});
