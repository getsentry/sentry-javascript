import { conditionalTest } from '../../utils';
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

  conditionalTest({ min: 18 })('--import', () => {
    test('ESM', done => {
      createRunner(__dirname, 'app.mjs')
        .withFlags('--import=@sentry/node/init')
        .withMockSentryServer()
        .expect({ event: EVENT })
        .start(done);
    });
  });
});
