import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('modulesIntegration', () => {
  test('does not crash ESM setups', async ({ signal }) => {
    await createRunner({ signal }, __dirname, 'app.mjs').ensureNoErrorOutput().start().completed();
  });
});
