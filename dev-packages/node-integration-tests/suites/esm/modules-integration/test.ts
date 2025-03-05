import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('modulesIntegration', () => {
  test('does not crash ESM setups', async () => {
    await createRunner(__dirname, 'app.mjs').ensureNoErrorOutput().start().completed();
  });
});
