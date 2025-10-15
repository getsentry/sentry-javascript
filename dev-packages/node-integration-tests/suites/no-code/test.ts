import { afterAll, describe, test } from 'vitest';
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

  test('CJS', async ({ signal }) => {
    await createRunner({ signal }, __dirname, 'app.js')
      .withFlags('--require=@sentry/node/init')
      .withMockSentryServer()
      .expect({ event: EVENT })
      .start()
      .completed();
  });

  describe('--import', () => {
    test('ESM', async ({ signal }) => {
      await createRunner({ signal }, __dirname, 'app.mjs')
        .withFlags('--import=@sentry/node/init')
        .withMockSentryServer()
        .expect({ event: EVENT })
        .start()
        .completed();
    });
  });
});
