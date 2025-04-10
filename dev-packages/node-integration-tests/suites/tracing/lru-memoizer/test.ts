import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('lru-memoizer', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('keeps outer context inside the memoized inner functions', async () => {
    await createRunner(__dirname, 'scenario.js')
      // We expect only one transaction and nothing else.
      // A failed test will result in an error event being sent to Sentry.
      // Which will fail this suite.
      .expect({
        transaction: {
          transaction: '<unknown>',
          contexts: {
            trace: expect.objectContaining({
              op: 'run',
              data: expect.objectContaining({
                'sentry.op': 'run',
                'sentry.origin': 'manual',
              }),
            }),
          },
        },
      })
      .start()
      .completed();
  });
});
