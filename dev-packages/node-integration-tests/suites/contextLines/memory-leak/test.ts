import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

conditionalTest({ min: 18 })('ContextLines integration in CJS', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Regression test for: https://github.com/getsentry/sentry-javascript/issues/14892
  test('does not leak open file handles', done => {
    createRunner(__dirname, 'scenario.ts')
      .expectN(10, {
        event: {},
      })
      .start(done);
  });
});
