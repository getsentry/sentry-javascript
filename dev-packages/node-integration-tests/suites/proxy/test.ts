import { cleanupChildProcesses, createRunner } from '../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('proxies sentry requests', done => {
  createRunner(__dirname, 'basic.js')
    .withMockSentryServer()
    .expect({
      event: {
        message: 'Hello, via proxy!',
      },
    })
    .start(done);
});
