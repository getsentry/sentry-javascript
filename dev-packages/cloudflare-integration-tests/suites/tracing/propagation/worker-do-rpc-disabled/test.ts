import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('does not propagate trace when enableRpcTracePropagation is disabled', async ({ signal }) => {
  let workerTraceId: string | undefined;
  let doTraceId: string | undefined;

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
        }),
      );

      const txName = transactionEvent.transaction as string;
      const traceId = transactionEvent.contexts?.trace?.trace_id as string;

      if (txName === 'GET /do/hello') {
        workerTraceId = traceId;
      } else if (txName === 'GET /hello') {
        doTraceId = traceId;
      }
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
        }),
      );

      const txName = transactionEvent.transaction as string;
      const traceId = transactionEvent.contexts?.trace?.trace_id as string;

      if (txName === 'GET /do/hello') {
        workerTraceId = traceId;
      } else if (txName === 'GET /hello') {
        doTraceId = traceId;
      }
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/do/hello');
  expect(response).toBe('Hello, World!');

  await runner.completed();

  // Both transactions should exist but have different trace IDs (no propagation)
  expect(workerTraceId).toBeDefined();
  expect(doTraceId).toBeDefined();
  expect(workerTraceId).not.toBe(doTraceId);
});
