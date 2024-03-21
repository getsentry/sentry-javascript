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
test('applies withScope scope to thrown error', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('session', 'sessions')
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
        tags: {
          global: 'tag',
          local: undefined, // This tag is missing :(
        },
      },
    })
    .start(done);

  expect(() => runner.makeRequest('get', '/test/withScope')).rejects.toThrow();
});
