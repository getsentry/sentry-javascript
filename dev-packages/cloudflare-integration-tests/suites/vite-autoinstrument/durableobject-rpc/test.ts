import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// `enableRpcTracePropagation` defaults to off, but the Vite plugin knows from the wrangler config
// that `COUNTER` resolves to a Durable Object class in this same worker — a receiver it instruments
// itself — so it enables propagation for that binding without any configuration.
it('propagates the trace over a Durable Object RPC call without configuring the binding', async ({ signal }) => {
  let workerTraceId: string | undefined;
  let doTraceId: string | undefined;

  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.contexts?.trace?.op).toBe('rpc');
      doTraceId = transactionEvent.contexts?.trace?.trace_id;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      workerTraceId = transactionEvent.contexts?.trace?.trace_id;
    })
    .start(signal);

  // The receiver strips the metadata argument, so the method still sees exactly what it was called
  // with — the trace continues without the RPC signature changing.
  const response = await runner.makeRequest<{ count: number; argumentCount: number }>('get', '/increment');
  expect(response).toEqual({ count: 1, argumentCount: 1 });

  await runner.completed();

  expect(workerTraceId).toBeDefined();
  expect(doTraceId).toBe(workerTraceId);
});
