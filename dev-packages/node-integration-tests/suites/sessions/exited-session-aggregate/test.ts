import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterEach(() => {
  cleanupChildProcesses();
});

test('should aggregate successful sessions', async () => {
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
            exited: 3,
          },
        ],
      },
    })
    .start(_done);

  runner.makeRequest('get', '/success');
  runner.makeRequest('get', '/success_next');
  runner.makeRequest('get', '/success_slow');

  await promise;
});
