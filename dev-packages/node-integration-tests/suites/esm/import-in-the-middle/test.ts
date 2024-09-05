import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

conditionalTest({ min: 18 })('import-in-the-middle', () => {
  test('onlyIncludeInstrumentedModules', done => {
    createRunner(__dirname, 'app.mjs').ensureNoErrorOutput().start(done);
  });
});
