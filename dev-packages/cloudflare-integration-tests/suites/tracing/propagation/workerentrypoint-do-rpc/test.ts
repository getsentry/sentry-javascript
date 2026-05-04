import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('propagates trace from WorkerEntrypoint to durable object via this.env RPC call', async ({ signal }) => {
  let workerTraceId: string | undefined;
  let workerSpanId: string | undefined;
  let doTraceId: string | undefined;
  let doParentSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

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
          transaction: 'sayHello',
        }),
      );
      doTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      doParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
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
          transaction: 'GET /rpc/hello',
        }),
      );
      workerTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      workerSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/rpc/hello');
  expect(response).toBe('Hello, World!');

  await runner.completed();

  expect(workerTraceId).toBeDefined();
  expect(doTraceId).toBeDefined();
  expect(workerTraceId).toBe(doTraceId);

  expect(workerSpanId).toBeDefined();
  expect(doParentSpanId).toBeDefined();
  expect(doParentSpanId).toBe(workerSpanId);
});

it('propagates trace for RPC method with multiple arguments via this.env', async ({ signal }) => {
  let workerTraceId: string | undefined;
  let workerSpanId: string | undefined;
  let doTraceId: string | undefined;
  let doParentSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'rpc',
            }),
          }),
          transaction: 'multiply',
        }),
      );
      doTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      doParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
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
          transaction: 'GET /rpc/multiply',
        }),
      );
      workerTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      workerSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/rpc/multiply');
  expect(response).toBe('42');

  await runner.completed();

  expect(workerTraceId).toBeDefined();
  expect(doTraceId).toBeDefined();
  expect(workerTraceId).toBe(doTraceId);

  expect(workerSpanId).toBeDefined();
  expect(doParentSpanId).toBeDefined();
  expect(doParentSpanId).toBe(workerSpanId);
});
