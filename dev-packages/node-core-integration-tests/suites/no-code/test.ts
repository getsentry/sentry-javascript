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

  test('CJS', async () => {
    await createRunner(__dirname, 'app.js')
      .withFlags('--require=@sentry/node-core/init')
      .withMockSentryServer()
      .expect({ event: EVENT })
      .start()
      .completed();
  });

  describe('--import', () => {
    test('ESM', async () => {
      await createRunner(__dirname, 'app.mjs')
        .withFlags('--import=@sentry/node-core/init')
        .withMockSentryServer()
        .expect({ event: EVENT })
        .start()
        .completed();
    });
  });
});
