import { createRunner } from '../../utils/runner';

describe('metrics', () => {
  test('should exit', done => {
    const runner = createRunner(__dirname, 'should-exit.js').start();

    setTimeout(() => {
      expect(runner.childHasExited()).toBe(true);
      done();
    }, 5_000);
  });

  test('should exit forced', done => {
    const runner = createRunner(__dirname, 'should-exit-forced.js').start();

    setTimeout(() => {
      expect(runner.childHasExited()).toBe(true);
      done();
    }, 5_000);
  });
});
