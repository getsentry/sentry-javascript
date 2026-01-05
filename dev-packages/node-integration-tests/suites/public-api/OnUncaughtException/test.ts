import * as childProcess from 'child_process';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { createRunner } from '../../../utils/runner';

describe('OnUncaughtException integration', () => {
  test('should close process on uncaught error with no additional listeners registered', () =>
    new Promise<void>(done => {
      expect.assertions(3);

      const testScriptPath = path.resolve(__dirname, 'no-additional-listener-test-script.js');

      childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
        expect(err).not.toBeNull();
        expect(err?.code).toBe(1);
        expect(stdout).not.toBe("I'm alive!");
        done();
      });
    }));

  test('should not close process on uncaught error when additional listeners are registered', () =>
    new Promise<void>(done => {
      expect.assertions(2);

      const testScriptPath = path.resolve(__dirname, 'additional-listener-test-script.js');

      childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
        expect(err).toBeNull();
        expect(stdout).toBe("I'm alive!");
        done();
      });
    }));

  test('should log entire error object to console stderr', () =>
    new Promise<void>(done => {
      expect.assertions(2);

      const testScriptPath = path.resolve(__dirname, 'log-entire-error-to-console.js');

      childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stderr) => {
        expect(err).not.toBeNull();
        const errString = err?.toString() || '';

        expect(errString).toContain(stderr);

        done();
      });
    }));

  describe('with `exitEvenIfOtherHandlersAreRegistered` set to false', () => {
    test('should close process on uncaught error with no additional listeners registered', () =>
      new Promise<void>(done => {
        expect.assertions(3);

        const testScriptPath = path.resolve(__dirname, 'mimic-native-behaviour-no-additional-listener-test-script.js');

        childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
          expect(err).not.toBeNull();
          expect(err?.code).toBe(1);
          expect(stdout).not.toBe("I'm alive!");
          done();
        });
      }));

    test('should not close process on uncaught error when additional listeners are registered', () =>
      new Promise<void>(done => {
        expect.assertions(2);

        const testScriptPath = path.resolve(__dirname, 'mimic-native-behaviour-additional-listener-test-script.js');

        childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (err, stdout) => {
          expect(err).toBeNull();
          expect(stdout).toBe("I'm alive!");
          done();
        });
      }));
  });

  test('sets correct event mechanism', async () => {
    await createRunner(__dirname, 'basic.js')
      .expect({
        event: {
          level: 'fatal',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'foo',
                mechanism: {
                  type: 'auto.node.onuncaughtexception',
                  handled: false,
                },
                stacktrace: {
                  frames: expect.any(Array),
                },
              },
            ],
          },
        },
      })
      .start()
      .completed();
  });

  conditionalTest({ max: 18 })('Worker thread error handling Node 18', () => {
    test('should capture uncaught worker thread errors - without childProcess integration', async () => {
      await createRunner(__dirname, 'worker-thread/uncaught-worker.mjs')
        .withInstrument(path.join(__dirname, 'worker-thread/instrument.mjs'))
        .expect({
          event: {
            level: 'fatal',
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'job failed',
                  mechanism: {
                    type: 'auto.node.onuncaughtexception',
                    handled: false,
                  },
                  stacktrace: {
                    frames: expect.any(Array),
                  },
                },
              ],
            },
          },
        })
        .start()
        .completed();
    });
  });

  // childProcessIntegration only exists in Node 20+
  conditionalTest({ min: 20 })('Worker thread error handling Node 20+', () => {
    test.each(['mjs', 'js'])('should not interfere with worker thread error handling ".%s"', async extension => {
      const runner = createRunner(__dirname, `worker-thread/caught-worker.${extension}`)
        .withFlags(
          extension === 'mjs' ? '--import' : '--require',
          path.join(__dirname, `worker-thread/instrument.${extension}`),
        )
        .expect({
          event: {
            level: 'error',
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'job failed',
                  mechanism: {
                    type: 'auto.child_process.worker_thread',
                    handled: false,
                  },
                  stacktrace: {
                    frames: expect.any(Array),
                  },
                },
              ],
            },
          },
        })
        .start();

      await runner.completed();

      const logs = runner.getLogs();

      expect(logs).toEqual(expect.arrayContaining([expect.stringMatching(/^caught Error: job failed/)]));
    });

    test('should not interfere with worker thread error handling when required inline', async () => {
      const runner = createRunner(__dirname, 'worker-thread/caught-worker-inline.js')
        .expect({
          event: {
            level: 'error',
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'job failed',
                  mechanism: {
                    type: 'auto.child_process.worker_thread',
                    handled: false,
                  },
                  stacktrace: {
                    frames: expect.any(Array),
                  },
                },
              ],
            },
          },
        })
        .start();

      await runner.completed();

      const logs = runner.getLogs();

      expect(logs).toEqual(expect.arrayContaining([expect.stringMatching(/^caught Error: job failed/)]));
    });

    test('should capture uncaught worker thread errors', async () => {
      await createRunner(__dirname, 'worker-thread/uncaught-worker.mjs')
        .withInstrument(path.join(__dirname, 'worker-thread/instrument.mjs'))
        .expect({
          event: {
            level: 'error',
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'job failed',
                  mechanism: {
                    type: 'auto.child_process.worker_thread',
                    handled: false,
                  },
                  stacktrace: {
                    frames: expect.any(Array),
                  },
                },
              ],
            },
          },
        })
        .start()
        .completed();
    });
  });
});
