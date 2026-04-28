import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('propagates trace from worker to worker to durable object (3 levels deep)', async ({ signal }) => {
  let mainWorkerTraceId: string | undefined;
  let mainWorkerSpanId: string | undefined;
  let subWorkerTraceId: string | undefined;
  let subWorkerSpanId: string | undefined;
  let subWorkerParentSpanId: string | undefined;
  let doTraceId: string | undefined;
  let doParentSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      // Main worker HTTP server transaction
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
          transaction: 'GET /chain',
        }),
      );
      mainWorkerTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      mainWorkerSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      // Sub-worker HTTP server transaction (from service binding fetch)
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
          transaction: 'GET /call-do',
        }),
      );
      subWorkerTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      subWorkerSpanId = transactionEvent.contexts?.trace?.span_id as string;
      subWorkerParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      // Durable Object RPC transaction
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'rpc',
              data: expect.objectContaining({
                'sentry.origin': 'auto.faas.cloudflare.durable_object',
              }),
              origin: 'auto.faas.cloudflare.durable_object',
            }),
          }),
          transaction: 'computeAnswer',
        }),
      );
      doTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      doParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/chain');
  expect(response).toBe('The answer is 42');

  await runner.completed();

  // All three transactions should share the same trace_id
  expect(mainWorkerTraceId).toBeDefined();
  expect(subWorkerTraceId).toBeDefined();
  expect(doTraceId).toBeDefined();
  expect(mainWorkerTraceId).toBe(subWorkerTraceId);
  expect(subWorkerTraceId).toBe(doTraceId);

  // Verify the parent-child relationships form a chain:
  // Main Worker -> Sub Worker -> DO
  expect(mainWorkerSpanId).toBeDefined();
  expect(subWorkerParentSpanId).toBeDefined();
  expect(subWorkerParentSpanId).toBe(mainWorkerSpanId);

  expect(subWorkerSpanId).toBeDefined();
  expect(doParentSpanId).toBeDefined();
  expect(doParentSpanId).toBe(subWorkerSpanId);
});
