import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

conditionalTest({ min: 18 })('modulesIntegration', () => {
  test('does not crash ESM setups', done => {
    createRunner(__dirname, 'app.mjs').ensureNoErrorOutput().start(done);
  });
});
