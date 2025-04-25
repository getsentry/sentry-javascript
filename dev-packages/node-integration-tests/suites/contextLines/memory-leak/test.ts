import { cleanupChildProcesses, createRunner } from '../../../utils/runner';
import { describe, afterAll, test } from 'vitest';

describe('ContextLines integration in CJS', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Regression test for: https://github.com/getsentry/sentry-javascript/issues/14892
  test('does not leak open file handles', async () => {
   await createRunner(__dirname, 'scenario.ts')
      .expectN(10, {
        event: {},
      })
      .start()
      .completed();
  });
});
