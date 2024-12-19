import { cleanupChildProcesses, createRunner } from '../../utils/runner';

const EVENT = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'Test error',
      },
    ],
  },
};

describe('no-code init', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('CJS', done => {
    createRunner(__dirname, 'app.js')
      .withFlags('--require=@sentry/node/init')
      .withMockSentryServer()
      .expect({ event: EVENT })
      .start(done);
  });

  describe('--import', () => {
    test('ESM', done => {
      createRunner(__dirname, 'app.mjs')
        .withFlags('--import=@sentry/node/init')
        .withMockSentryServer()
        .expect({ event: EVENT })
        .start(done);
    });
  });
});
