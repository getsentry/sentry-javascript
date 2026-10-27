import { SDK_VERSION } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('captures an error thrown in Bun.serve fetch handler', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .ignore('span')
    .expect({
      event: {
        level: 'error',
        platform: 'node',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'This is a test error from the Bun integration tests',
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
        sdk: expect.objectContaining({
          name: 'sentry.javascript.bun',
          packages: [{ name: 'npm:@sentry/bun', version: SDK_VERSION }],
        }),
        contexts: expect.objectContaining({
          runtime: { name: 'bun', version: expect.any(String) },
        }),
      },
    })
    .start();

  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});

test('sends the error with a sampled trace envelope header', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .ignore('span')
    .expectHeader({
      event: {
        sdk: { name: 'sentry.javascript.bun', version: SDK_VERSION },
        trace: expect.objectContaining({
          environment: 'production',
          public_key: 'public',
          trace_id: expect.stringMatching(/^[\da-f]{32}$/),
          sample_rate: '1',
          sampled: 'true',
          sample_rand: expect.stringMatching(/^[01](\.\d+)?$/),
        }),
      },
    })
    .start();

  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});
