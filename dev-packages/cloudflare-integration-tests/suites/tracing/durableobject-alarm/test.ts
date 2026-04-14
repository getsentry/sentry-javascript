import { expect, it, describe } from 'vitest';
import { createRunner } from '../../../runner';

describe('Alarm instrumentation', () => {
  it('captures error from alarm handler', async ({ signal }) => {
    let setAlarmTraceId: string | undefined;

    const runner = createRunner(__dirname)
      .unignore('event')
      // First envelope: transaction from setAlarm call
      .expect(envelope => {
        const transactionEvent = envelope[1]?.[0]?.[1];
        setAlarmTraceId = transactionEvent?.contexts?.trace?.trace_id;
      })
      // Second envelope: error from alarm handler
      .expect(envelope => {
        const errorEvent = envelope[1]?.[0]?.[1];
        expect(errorEvent).toEqual(
          expect.objectContaining({
            exception: expect.objectContaining({
              values: expect.arrayContaining([
                expect.objectContaining({
                  value: 'Alarm error captured by Sentry',
                  mechanism: expect.objectContaining({
                    type: 'auto.faas.cloudflare.durable_object',
                  }),
                }),
              ]),
            }),
          }),
        );
      })
      .start(signal);

    await runner.makeRequest('get', '/setAlarm?action=throw');
    await runner.completed();

    expect(setAlarmTraceId).toBeDefined();
  });

  it('creates a transaction for alarm with new trace linked to setAlarm', async ({ signal }) => {
    let setAlarmTraceId: string | undefined;

    const runner = createRunner(__dirname)
      // First envelope: transaction from setAlarm call
      .expect(envelope => {
        const transactionEvent = envelope[1]?.[0]?.[1];
        setAlarmTraceId = transactionEvent?.contexts?.trace?.trace_id;
        expect(setAlarmTraceId).toBeDefined();
      })
      // Second envelope: transaction from alarm handler
      .expect(envelope => {
        const alarmTransaction = envelope[1]?.[0]?.[1];

        // Alarm creates a transaction with correct attributes
        expect(alarmTransaction).toEqual(
          expect.objectContaining({
            transaction: 'alarm',
            contexts: expect.objectContaining({
              trace: expect.objectContaining({
                op: 'function',
                origin: 'auto.faas.cloudflare.durable_object',
              }),
            }),
          }),
        );

        // Alarm starts a new trace (different trace ID from the request that called setAlarm)
        const alarmTraceId = alarmTransaction?.contexts?.trace?.trace_id;
        expect(alarmTraceId).not.toBe(setAlarmTraceId);

        // Alarm links to the trace that called setAlarm via sentry.previous_trace attribute
        const previousTrace = alarmTransaction?.contexts?.trace?.data?.['sentry.previous_trace'];
        expect(previousTrace).toBeDefined();
        expect(previousTrace).toContain(setAlarmTraceId);
      })
      .start(signal);

    await runner.makeRequest('get', '/setAlarm');
    await runner.completed();
  });
});
