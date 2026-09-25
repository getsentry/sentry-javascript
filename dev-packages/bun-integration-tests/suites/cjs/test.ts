import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('initializes when @sentry/bun is loaded with require()', async () => {
  const runner = createRunner(__dirname, 'index.cjs')
    .withMockSentryServer()
    .ignore('span')
    .expect({
      event: {
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
        sdk: expect.objectContaining({ name: 'sentry.javascript.bun' }),
      },
    })
    .start();

  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});
