import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe('modulesIntegration', () => {
  test('does not crash ESM setups', done => {
    createRunner(__dirname, 'app.mjs').ensureNoErrorOutput().start(done);
  });
});
