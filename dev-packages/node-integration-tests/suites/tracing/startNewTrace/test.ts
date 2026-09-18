import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const CONFIGS = [
  ['no tracesSampleRate (TwP)', undefined],
  ['tracesSampleRate=1', '1'],
  ['tracesSampleRate=0', '0'],
] as const;

describe('startNewTrace', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test.each(CONFIGS)('starts a fresh trace shared by every root span in the callback [%s]', async (_name, rate) => {
      await createRunner()
        .withEnv({ TRACES_SAMPLE_RATE: rate })
        // Transactions (if any, in rate=1) are irrelevant here and their ordering vs. the error is
        // not deterministic, so we ignore them and rely entirely on the stashed error context.
        .ignore('transaction')
        .expect({
          event: event => {
            const trace = event.contexts?.trace;
            const ctx = (event.contexts?.startNewTrace ?? {}) as Record<string, string>;

            const newTraceId = ctx.newTraceId;
            expect(newTraceId).toMatch(/^[a-f0-9]{32}$/);

            // Fresh trace: detached from the ambient/outer span's trace.
            expect(ctx.outerTraceId).toMatch(/^[a-f0-9]{32}$/);
            expect(newTraceId).not.toBe(ctx.outerTraceId);

            // All root spans created within the callback share the ONE new trace id.
            expect(ctx.span1TraceId).toBe(newTraceId);
            expect(ctx.span2TraceId).toBe(newTraceId);
            expect(ctx.activeSpanTraceId).toBe(newTraceId);

            // The captured error is on the new trace.
            expect(trace?.trace_id).toBe(newTraceId);

            // Outgoing propagation carries the new trace id.
            expect(ctx.sentryTrace).toMatch(new RegExp(`^${newTraceId}-[a-f0-9]{16}`));
            expect(ctx.baggage).toContain(`sentry-trace_id=${newTraceId}`);
          },
        })
        .start()
        .completed();
    });
  });
});
