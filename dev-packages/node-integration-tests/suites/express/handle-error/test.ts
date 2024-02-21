import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture and send Express controller error.', done => {
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
      },
    })
    .start(done);

  expect(() => runner.makeRequest('get', '/test/express')).rejects.toThrow();
});
