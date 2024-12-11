import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

conditionalTest({ min: 18 })('import-in-the-middle', () => {
  test('onlyIncludeInstrumentedModules', done => {
    const runner = createRunner(__dirname, 'app.mjs').start(() => {
      runner.getLogs().forEach(logMsg => {
        expect(logMsg).not.toContain('should be the only hooked modules but we just hooked');
      });
      done();
    });
  });
});
