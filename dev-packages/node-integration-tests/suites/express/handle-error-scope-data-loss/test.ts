import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

/**
 * Why does this test exist?
 *
 * We recently discovered that errors caught by global handlers will potentially loose scope data from the active scope
 * where the error was originally thrown in. The simple example in this test (see subject.ts) demonstrates this behavior
 * (in a Node environment but the same behavior applies to the browser; see the test there).
 *
 * This test nevertheless covers the behavior so that we're aware.
 */
test('withScope scope is NOT applied to thrown error caught by global handler', async () => {
  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      event: {
        exception: {
          values: [
            {
              mechanism: {
                type: 'auto.middleware.express',
                handled: false,
              },
              type: 'Error',
              value: 'test_error',
              stacktrace: {
                frames: expect.arrayContaining([
                  expect.objectContaining({
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                  }),
                ]),
              },
            },
          ],
        },
        // 'local' tag is not applied to the event
        tags: expect.not.objectContaining({ local: expect.anything() }),
      },
    })
    .start();

  runner.makeRequest('get', '/test/withScope', { expectError: true });

  await runner.completed();
});

/**
 * This test shows that the isolation scope set tags are applied correctly to the error.
 */
test('http requestisolation scope is applied to thrown error caught by global handler', async () => {
  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      event: {
        exception: {
          values: [
            {
              mechanism: {
                type: 'auto.middleware.express',
                handled: false,
              },
              type: 'Error',
              value: 'isolation_test_error',
              stacktrace: {
                frames: expect.arrayContaining([
                  expect.objectContaining({
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                  }),
                ]),
              },
            },
          ],
        },
        tags: {
          global: 'tag',
          'isolation-scope': 'tag',
        },
      },
    })
    .start();

  runner.makeRequest('get', '/test/isolationScope', { expectError: true });

  await runner.completed();
});

/**
 * This test shows that an inner isolation scope, created via `withIsolationScope`, is not applied to the error.
 *
 * This behaviour occurs because, just like in the test above where we use `getIsolationScope().setTag`,
 * this isolation scope again is only valid as long as we're in the callback.
 *
 * So why _does_ the http isolation scope get applied then? Because express' error handler applies on
 * a per-request basis, meaning, it's called while we're inside the isolation scope of the http request,
 * created from our `httpIntegration`.
 */
test('withIsolationScope scope is NOT applied to thrown error caught by global handler', async () => {
  const runner = createRunner(__dirname, 'server.ts')
    .expect({
      event: {
        exception: {
          values: [
            {
              mechanism: {
                type: 'auto.middleware.express',
                handled: false,
              },
              type: 'Error',
              value: 'with_isolation_scope_test_error',
              stacktrace: {
                frames: expect.arrayContaining([
                  expect.objectContaining({
                    function: expect.any(String),
                    lineno: expect.any(Number),
                    colno: expect.any(Number),
                  }),
                ]),
              },
            },
          ],
        },
        // 'with-isolation-scope' tag is not applied to the event
        tags: expect.not.objectContaining({ 'with-isolation-scope': expect.anything() }),
      },
    })
    .start();

  runner.makeRequest('get', '/test/withIsolationScope', { expectError: true });

  await runner.completed();
});
