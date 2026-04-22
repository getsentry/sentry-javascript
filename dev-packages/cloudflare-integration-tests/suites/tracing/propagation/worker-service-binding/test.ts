import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('propagates trace from worker to worker via service binding', async ({ signal }) => {
  let workerTraceId: string | undefined;
  let workerSpanId: string | undefined;
  let subWorkerTraceId: string | undefined;
  let subWorkerParentSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              data: expect.objectContaining({
                'sentry.origin': 'auto.http.cloudflare',
              }),
              origin: 'auto.http.cloudflare',
            }),
          }),
          transaction: 'GET /',
        }),
      );
      workerTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      workerSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              data: expect.objectContaining({
                'sentry.origin': 'auto.http.cloudflare',
              }),
              origin: 'auto.http.cloudflare',
            }),
          }),
          transaction: 'GET /hello',
        }),
      );
      subWorkerTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      subWorkerParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();

  expect(workerTraceId).toBeDefined();
  expect(subWorkerTraceId).toBeDefined();
  expect(workerTraceId).toBe(subWorkerTraceId);

  expect(workerSpanId).toBeDefined();
  expect(subWorkerParentSpanId).toBeDefined();
  expect(subWorkerParentSpanId).toBe(workerSpanId);
});
