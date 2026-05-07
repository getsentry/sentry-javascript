import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('propagates trace from Worker (ExportedHandler) to WorkerEntrypoint via service binding fetch', async ({
  signal,
}) => {
  let workerTraceId: string | undefined;
  let workerSpanId: string | undefined;
  let entrypointTraceId: string | undefined;
  let entrypointParentSpanId: string | undefined;

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
          transaction: 'GET /call-entrypoint',
        }),
      );
      workerTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      workerSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      // WorkerEntrypoint HTTP server transaction (from service binding fetch)
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
          transaction: 'GET /answer',
        }),
      );
      entrypointTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      entrypointParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/call-entrypoint');
  expect(response).toBe('The answer is 42');

  await runner.completed();

  // Both transactions should share the same trace_id
  expect(workerTraceId).toBeDefined();
  expect(entrypointTraceId).toBeDefined();
  expect(workerTraceId).toBe(entrypointTraceId);

  // Verify the parent-child relationship: Worker -> WorkerEntrypoint
  expect(workerSpanId).toBeDefined();
  expect(entrypointParentSpanId).toBeDefined();
  expect(entrypointParentSpanId).toBe(workerSpanId);
});

it('propagates trace for request with query params from Worker to WorkerEntrypoint', async ({ signal }) => {
  let workerTraceId: string | undefined;
  let workerSpanId: string | undefined;
  let entrypointTraceId: string | undefined;
  let entrypointParentSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
            }),
          }),
          transaction: 'GET /call-entrypoint-greet',
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
            }),
          }),
          transaction: 'GET /greet',
        }),
      );
      entrypointTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      entrypointParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/call-entrypoint-greet');
  expect(response).toBe('Hello, World!');

  await runner.completed();

  expect(workerTraceId).toBeDefined();
  expect(entrypointTraceId).toBeDefined();
  expect(workerTraceId).toBe(entrypointTraceId);

  expect(workerSpanId).toBeDefined();
  expect(entrypointParentSpanId).toBeDefined();
  expect(entrypointParentSpanId).toBe(workerSpanId);
});
