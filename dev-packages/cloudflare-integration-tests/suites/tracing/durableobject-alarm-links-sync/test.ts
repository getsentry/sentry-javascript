import { expect, it } from 'vitest';
import type { TransactionEvent } from '@sentry/core';
import { createRunner } from '../../../runner';

it('sync alarm links to the trace that scheduled it via sentry.previous_trace', async ({ signal }) => {
  let setAlarmTransaction: TransactionEvent | undefined;
  let alarmTransaction: TransactionEvent | undefined;
  const testId = Date.now().toString();

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          transaction: expect.stringContaining('/set-alarm'),
        }),
      );
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          transaction: 'setAlarm',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'rpc',
              origin: 'auto.faas.cloudflare.durable_object',
            }),
          }),
        }),
      );
      setAlarmTransaction = transactionEvent;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'alarm',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'function',
              origin: 'auto.faas.cloudflare.durable_object',
            }),
          }),
        }),
      );
      alarmTransaction = transactionEvent;
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', `/set-alarm?id=${testId}`);
  await runner.completed();

  // This is the key assertion: even though the alarm handler is synchronous,
  // sentry.previous_trace should still be set because we await the linkPromise
  // before teardown in the sync path
  const traceData = alarmTransaction!.contexts?.trace?.data as Record<string, unknown> | undefined;
  const previousTrace = traceData?.['sentry.previous_trace'] as string | undefined;

  expect(previousTrace).toBeDefined();
  expect(previousTrace).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);

  const [linkedTraceId] = previousTrace!.split('-');
  expect(linkedTraceId).toBe(setAlarmTransaction!.contexts?.trace?.trace_id);
});
