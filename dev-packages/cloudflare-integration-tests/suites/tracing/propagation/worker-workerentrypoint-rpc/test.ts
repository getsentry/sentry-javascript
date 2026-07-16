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

it('instruments inherited custom WorkerEntrypoint RPC methods and strips metadata', async ({ signal }) => {
  let callerTraceId: string | undefined;
  let receiverTraceId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('GET /call-entrypoint-rpc');
      callerTraceId = event.contexts?.trace?.trace_id;
    })
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('get');
      expect(event.contexts?.trace?.op).toBe('rpc');
      receiverTraceId = event.contexts?.trace?.trace_id;
    })
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('inherited');
      expect(event.contexts?.trace?.op).toBe('rpc');
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<{ argumentCount: number; inherited: string; key: string }>(
    'get',
    '/call-entrypoint-rpc',
  );
  expect(response).toEqual({ argumentCount: 1, inherited: 'base-value', key: 'feature-key' });

  await runner.completed();
  expect(receiverTraceId).toBe(callerTraceId);
});

it('captures errors thrown by custom WorkerEntrypoint RPC methods', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.value).toBe('custom RPC receiver failed');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.faas.cloudflare.worker_entrypoint',
      });
      expect(event.tags?.initial_scope).toBe('applied');
      expect(event.tags?.before_send).toBe('applied');
    })
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('throwError');
    })
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('GET /call-entrypoint-rpc-error');
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/call-entrypoint-rpc-error');
  expect(response).toBe('fallback');

  await runner.completed();
});

it('captures errors from loopback WorkerEntrypoint RPC without trace propagation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.value).toBe('loopback RPC receiver failed');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.faas.cloudflare.worker_entrypoint',
      });
    })
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('GET /call-loopback-rpc-error');
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/call-loopback-rpc-error');
  expect(response).toBe('fallback');

  await runner.completed();
});
