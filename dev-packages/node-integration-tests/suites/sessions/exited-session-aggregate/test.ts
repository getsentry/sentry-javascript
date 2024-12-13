import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterEach(() => {
  cleanupChildProcesses();
});

test('should aggregate successful sessions', done => {
  const runner = createRunner(__dirname, '..', 'server.ts')
    .ignore('transaction', 'event')
    .unignore('sessions')
    .expect({
      sessions: {
        aggregates: [
          {
            started: expect.any(String),
            exited: 3,
          },
        ],
      },
    })
    .start(done);

  runner.makeRequest('get', '/test/success');
  runner.makeRequest('get', '/test/success_next');
  runner.makeRequest('get', '/test/success_slow');
});
