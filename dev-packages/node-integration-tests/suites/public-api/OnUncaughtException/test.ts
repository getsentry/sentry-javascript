import * as childProcess from 'child_process';
import * as path from 'path';
import { describe, expect, test } from 'vitest';
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

  test('should exit rather than recurse when stderr is a broken pipe', async () => {
    const testScriptPath = path.resolve(__dirname, 'broken-stdio-pipe-test-script.js');

    // The heap cap is what makes a regression fail in ~1s. At the default heap size the
    // runaway recursion takes about a minute to exhaust it and just looks like a hang.
    const child = childProcess.spawn(process.execPath, ['--max-old-space-size=64', testScriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.destroy();
    child.stderr.destroy();

    const exited = await new Promise<{ code: number | null; signal: string | null }>(resolve => {
      child.on('exit', (code, signal) => resolve({ code, signal }));
    });

    // Unbounded recursion shows up as SIGABRT from the V8 out-of-memory abort.
    expect(exited).toEqual({ code: 1, signal: null });
  });

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

  describe('Worker thread error handling', () => {
    test.each(['mjs', 'js'])('should not interfere with worker thread error handling ".%s"', async extension => {
      const runner = createRunner(__dirname, `worker-thread/caught-worker.${extension}`)
        .withFlags('--import', path.join(__dirname, `worker-thread/instrument.${extension}`))
        .expect({
          event: {
            level: 'error',
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'job failed',
                  mechanism: {
                    type: 'auto.node.worker_threads',
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
                    type: 'auto.node.worker_threads',
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
                    type: 'auto.node.worker_threads',
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
