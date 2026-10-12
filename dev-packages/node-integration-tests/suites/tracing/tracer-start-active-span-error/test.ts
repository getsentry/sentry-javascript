import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('tracer.startActiveSpan errors', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    // When a callback to raw OTel `tracer.startActiveSpan` throws and the error propagates
    // (uncaught), the span status is NOT automatically marked as errored. The user's `finally`
    // calls `span.end()` before the error propagates, and an OTel span becomes immutable on end.
    //
    // Users who want auto-status-on-error should use `Sentry.startSpan` instead, or follow the
    // OTel-idiomatic pattern: `span.recordException(err); span.setStatus({ code: ERROR })` in a
    // `catch` inside the callback.
    test('does NOT mark span errored when uncaught error escapes raw tracer.startActiveSpan callback', async () => {
      await createRunner()
        // The rejection is captured as an error event, which can reach the transport before the
        // span envelope.
        .ignore('event')
        .expect({
          span: {
            items: [
              {
                name: 'test span name',
                is_segment: true,
                start_timestamp: expect.any(Number),
                end_timestamp: expect.any(Number),
                status: 'ok',
              },
            ],
          },
        })
        .start()
        .completed();
    });
  });
});
