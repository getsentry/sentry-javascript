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
test('withScope scope is NOT applied to thrown error caught by global handler', done => {
  createRunner(__dirname, 'server.ts')
    .expect({
      event: {
        exception: {
          values: [
            {
              mechanism: {
                type: 'middleware',
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
    .start(done)
    .makeRequest('get', '/test/withScope', { expectError: true });
});

/**
 * This test shows that the isolation scope set tags are applied correctly to the error.
 */
test('isolation scope is applied to thrown error caught by global handler', done => {
  createRunner(__dirname, 'server.ts')
    .expect({
      event: {
        exception: {
          values: [
            {
              mechanism: {
                type: 'middleware',
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
    .start(done)
    .makeRequest('get', '/test/isolationScope', { expectError: true });
});
