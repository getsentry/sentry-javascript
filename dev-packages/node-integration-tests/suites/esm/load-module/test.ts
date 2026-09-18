import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('loadModule', () => {
  test('does not throw when called without `existingModule` from ESM', async () => {
    await createRunner(__dirname, 'app.mjs').ensureNoErrorOutput().start().completed();
  });
});
