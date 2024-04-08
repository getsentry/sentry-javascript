import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterEach(() => {
  cleanupChildProcesses();
});

test('should aggregate successful and crashed sessions', async () => {
  let _done: undefined | (() => void);
  const promise = new Promise<void>(resolve => {
    _done = resolve;
  });

  const runner = createRunner(__dirname, 'server.ts')
    .ignore('transaction', 'event', 'session')
    .expectError()
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
    .start(_done);

  runner.makeRequest('get', '/success');
  runner.makeRequest('get', '/error_unhandled');
  runner.makeRequest('get', '/success_next');

  await promise;
});
