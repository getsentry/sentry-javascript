import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterEach(() => {
  cleanupChildProcesses();
});

test('should aggregate successful and crashed sessions', done => {
  const runner = createRunner(__dirname, '..', 'server.ts')
    .ignore('transaction', 'event')
    .unignore('sessions')
    .expect({
      sessions: {
        aggregates: [
          {
            started: expect.any(String),
            exited: 2,
            crashed: 1,
          },
        ],
      },
    })
    .start(done);

  runner.makeRequest('get', '/test/success');
  runner.makeRequest('get', '/test/error_unhandled', { expectError: true });
  runner.makeRequest('get', '/test/success_next');
});
