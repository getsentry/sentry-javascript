import * as childProcess from 'child_process';
import * as path from 'path';

describe('OnUncaughtException integration', () => {
  test('should close process on uncaught error with no additional listeners registered', done => {
    expect.assertions(3);

    const testScriptPath = path.resolve(__dirname, 'no-additional-listener-test-script.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
      expect(err).not.toBeNull();
      expect(err?.code).toBe(1);
      expect(stdout).not.toBe("I'm alive!");
      done();
    });
  });

  test('should not close process on uncaught error when additional listeners are registered', done => {
    expect.assertions(2);

    const testScriptPath = path.resolve(__dirname, 'additional-listener-test-script.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
      expect(err).toBeNull();
      expect(stdout).toBe("I'm alive!");
      done();
    });
  });

  test('should log entire error object to console stderr', done => {
    expect.assertions(2);

    const testScriptPath = path.resolve(__dirname, 'log-entire-error-to-console.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stderr) => {
      expect(err).not.toBeNull();
      const errString = err?.toString() || '';

      expect(errString).toContain(stderr);

      done();
    });
  });

  describe('with `exitEvenIfOtherHandlersAreRegistered` set to false', () => {
    test('should close process on uncaught error with no additional listeners registered', done => {
      expect.assertions(3);

      const testScriptPath = path.resolve(__dirname, 'mimic-native-behaviour-no-additional-listener-test-script.js');

      childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
        expect(err).not.toBeNull();
        expect(err?.code).toBe(1);
        expect(stdout).not.toBe("I'm alive!");
        done();
      });
    });

    test('should not close process on uncaught error when additional listeners are registered', done => {
      expect.assertions(2);

      const testScriptPath = path.resolve(__dirname, 'mimic-native-behaviour-additional-listener-test-script.js');

      childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
        expect(err).toBeNull();
        expect(stdout).toBe("I'm alive!");
        done();
      });
    });
  });
});
