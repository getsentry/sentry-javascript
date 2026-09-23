import { expect, it } from 'vitest';
import { eventEnvelope } from '../../expect';
import { createRunner } from '../../runner';

it('initializes when @sentry/bun is loaded with require()', async ({ signal }) => {
  const runner = createRunner(__dirname, 'index.cjs')
    .expect(
      eventEnvelope(
        {
          level: 'error',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'This is a test error from a CommonJS Bun app',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.http.bun.serve', handled: false },
              },
            ],
          },
          request: expect.objectContaining({
            method: 'GET',
            url: expect.stringContaining('/error'),
          }),
        },
        { includeSampleRand: true, includeTransaction: false },
      ),
    )
    .ignore('span')
    .start(signal);
  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});
