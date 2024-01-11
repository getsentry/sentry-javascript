import { createRunner } from '../../utils/runner';

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
