import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should capture and send Express controller error with txn name if tracesSampleRate is 0', done => {
  const runner = createRunner(__dirname, 'server.ts')
    .ignore('session', 'sessions', 'transaction')
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
              value: 'test_error with id 123',
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
        transaction: 'GET /test/express/:id',
      },
    })
    .start(done);

  expect(() => runner.makeRequest('get', '/test/express/123')).rejects.toThrow();
});
