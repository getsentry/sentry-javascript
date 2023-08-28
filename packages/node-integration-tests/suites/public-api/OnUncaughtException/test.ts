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

  test('should close process on uncaught error when additional listeners are registered', done => {
    expect.assertions(3);

    const testScriptPath = path.resolve(__dirname, 'additional-listener-test-script.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
      expect(err).not.toBeNull();
      expect(err?.code).toBe(1);
      expect(stdout).not.toBe("I'm alive!");
      done();
    });
  });

  test('should log entire error object to console stderr', done => {
    const nodeVersion = Number(process.version.replace('v', '').split('.')[0]);
    expect.assertions(nodeVersion >= 16 ? 3 : 2);

    const testScriptPath = path.resolve(__dirname, 'log-entire-error-to-console.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stderr) => {
      expect(err).not.toBeNull();
      const errString = err?.toString() || '';

      expect(errString).toContain(stderr);

      if (nodeVersion >= 16) {
        // additional error properties are only printed to console since Node 16 :(
        expect(stderr).toContain("[cause]: 'bar'");
      }

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
