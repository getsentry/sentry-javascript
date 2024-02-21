import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('proxies sentry requests', done => {
  createRunner(__dirname, 'basic.js')
    .withMockSentryServer()
    .ignore('session')
    .expect({
      event: {
        message: 'Hello, via proxy!',
      },
    })
    .start(done);
});
