import { createRunner } from '../../utils/runner';

test('proxies sentry requests', done => {
  createRunner(__dirname, 'basic.js')
    .withMockSentryServer()
    .expect({
      event: {
        message: 'Hello, via proxy!',
      },
    })
    .start(done);
}, 10000);
