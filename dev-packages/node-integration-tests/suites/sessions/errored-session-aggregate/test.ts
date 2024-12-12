import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterEach(() => {
  cleanupChildProcesses();
});

test('should aggregate successful, crashed and erroneous sessions', done => {
  const runner = createRunner(__dirname, '..', 'server.ts')
    .ignore('transaction', 'event')
    .unignore('sessions')
    .expect({
      sessions: {
        aggregates: [
          {
            started: expect.any(String),
            exited: 1,
            crashed: 1,
            errored: 1,
          },
        ],
      },
    })
    .start(done);

  runner.makeRequest('get', '/test/success');
  runner.makeRequest('get', '/test/error_handled');
  runner.makeRequest('get', '/test/error_unhandled', { expectError: true });
});
