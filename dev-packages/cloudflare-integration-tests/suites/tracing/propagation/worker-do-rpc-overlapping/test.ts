import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

it('propagates the worker trace into each of two overlapping Durable Object RPC calls', async ({ signal }) => {
  const doTraces: Record<string, TransactionEvent['contexts']> = {};
  let workerTraceId: string | undefined;
  let workerSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('work');
      expect(transactionEvent.contexts?.trace?.op).toBe('rpc');
      expect(transactionEvent.contexts?.trace?.data?.['test.label']).toBe('a');
      doTraces.a = transactionEvent.contexts;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('work');
      expect(transactionEvent.contexts?.trace?.op).toBe('rpc');
      expect(transactionEvent.contexts?.trace?.data?.['test.label']).toBe('b');
      doTraces.b = transactionEvent.contexts;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('GET /overlapping');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      workerTraceId = transactionEvent.contexts?.trace?.trace_id;
      workerSpanId = transactionEvent.contexts?.trace?.span_id;
    })
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/overlapping');
  expect(response).toBe('a,b');

  await runner.completed();

  expect(workerTraceId).toMatch(/^[\da-f]{32}$/);
  expect(workerSpanId).toMatch(/^[\da-f]{16}$/);

  expect(doTraces.a?.trace?.trace_id).toBe(workerTraceId);
  expect(doTraces.a?.trace?.parent_span_id).toBe(workerSpanId);
  expect(doTraces.b?.trace?.trace_id).toBe(workerTraceId);
  expect(doTraces.b?.trace?.parent_span_id).toBe(workerSpanId);

  expect(doTraces.a?.trace?.span_id).not.toBe(doTraces.b?.trace?.span_id);
});
