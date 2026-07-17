import { expect, it } from 'vitest';
import { eventEnvelope } from '../../../expect';
import { createRunner } from '../../../runner';

// The Workers AI integration deliberately does not call `captureException` itself.
// When a `run` call fails, the error must bubble up out of the fetch handler and be
// reported by the top-level Cloudflare instrumentation instead — so it shows up in
// Sentry exactly once, with the `auto.http.cloudflare` mechanism.
it('bubbles up Workers AI errors to be captured by the top-level handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope(
        {
          level: 'error',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Workers AI run failed',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.http.cloudflare', handled: false },
              },
            ],
          },
          request: {
            headers: expect.any(Object),
            method: 'GET',
            url: expect.any(String),
          },
        },
        { includeTransaction: false },
      ),
    )
    .start(signal);
  await runner.makeRequest('get', '/', { expectError: true });
  await runner.completed();
});
