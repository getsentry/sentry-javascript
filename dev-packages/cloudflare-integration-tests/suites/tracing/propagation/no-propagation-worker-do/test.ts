import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('does not propagate trace from worker to durable object when enableRpcTracePropagation is disabled', async ({
  signal,
}) => {
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
          transaction: 'GET /',
        }),
      );
      workerTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      workerSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();

  expect(workerTraceId).toBeDefined();
  expect(doTraceId).toBeDefined();
  expect(workerTraceId).not.toBe(doTraceId);

  expect(workerSpanId).toBeDefined();
  expect(doParentSpanId).toBeUndefined();
});

it('does not propagate trace from queue handler to durable object when enableRpcTracePropagation is disabled', async ({
  signal,
}) => {
  let queueTraceId: string | undefined;
  let queueSpanId: string | undefined;
  let doTraceId: string | undefined;
  let doParentSpanId: string | undefined;

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
          transaction: 'GET /hello',
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
              op: 'queue.process',
              data: expect.objectContaining({
                'sentry.origin': 'auto.faas.cloudflare.queue',
              }),
              origin: 'auto.faas.cloudflare.queue',
            }),
          }),
          transaction: 'process my-queue',
        }),
      );
      queueTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      queueSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    // Also expect the fetch transaction from the /queue/send request
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
          transaction: 'GET /queue/send',
        }),
      );
    })
    .unordered()
    .start(signal);
  // The fetch handler sends a message to the queue, which triggers the queue consumer
  await runner.makeRequest('get', '/queue/send');
  await runner.completed();

  expect(queueTraceId).toBeDefined();
  expect(doTraceId).toBeDefined();
  expect(queueTraceId).not.toBe(doTraceId);

  expect(queueSpanId).toBeDefined();
  expect(doParentSpanId).toBeUndefined();
});

it('does not propagate trace from scheduled handler to durable object when enableRpcTracePropagation is disabled', async ({
  signal,
}) => {
  let scheduledTraceId: string | undefined;
  let scheduledSpanId: string | undefined;
  let doTraceId: string | undefined;
  let doParentSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .withWranglerArgs('--test-scheduled')
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
      doTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      doParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'faas.cron',
              data: expect.objectContaining({
                'sentry.origin': 'auto.faas.cloudflare.scheduled',
              }),
              origin: 'auto.faas.cloudflare.scheduled',
            }),
          }),
        }),
      );
      scheduledTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      scheduledSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/__scheduled?cron=*+*+*+*+*');
  await runner.completed();

  expect(scheduledTraceId).toBeDefined();
  expect(doTraceId).toBeDefined();
  expect(scheduledTraceId).not.toBe(doTraceId);

  expect(scheduledSpanId).toBeDefined();
  expect(doParentSpanId).toBeUndefined();
});
