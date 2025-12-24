import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('node-cron instrumentation with isolateTrace creates distinct traces for each cron job', async () => {
  let firstErrorTraceId: string | undefined;

  await createRunner(__dirname, 'scenario.ts')
    .ignore('check_in')
    .expect({
      event: event => {
        const traceId = event.contexts?.trace?.trace_id;
        const spanId = event.contexts?.trace?.span_id;

        expect(traceId).toMatch(/[a-f\d]{32}/);
        expect(spanId).toMatch(/[a-f\d]{16}/);

        firstErrorTraceId = traceId;

        expect(event.exception?.values?.[0]).toMatchObject({
          type: 'Error',
          value: expect.stringMatching(/^Error in cron job( 2)?$/),
          mechanism: { type: 'auto.function.node-cron.instrumentNodeCron', handled: false },
        });
      },
    })
    .expect({
      event: event => {
        const traceId = event.contexts?.trace?.trace_id;
        const spanId = event.contexts?.trace?.span_id;

        expect(traceId).toMatch(/[a-f\d]{32}/);
        expect(spanId).toMatch(/[a-f\d]{16}/);

        expect(traceId).not.toBe(firstErrorTraceId);

        expect(event.exception?.values?.[0]).toMatchObject({
          type: 'Error',
          value: expect.stringMatching(/^Error in cron job( 2)?$/),
          mechanism: { type: 'auto.function.node-cron.instrumentNodeCron', handled: false },
        });
      },
    })
    .start()
    .completed();
});
