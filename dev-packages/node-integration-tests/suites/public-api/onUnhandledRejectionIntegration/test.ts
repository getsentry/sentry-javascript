import type { Event } from '@sentry/node';
import * as childProcess from 'child_process';
import * as path from 'path';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('onUnhandledRejectionIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should show string-type promise rejection warnings by default', () =>
    new Promise<void>(done => {
      expect.assertions(3);

      const testScriptPath = path.resolve(__dirname, 'mode-warn-string.js');

      childProcess.execFile('node', [testScriptPath], { encoding: 'utf8' }, (err, stdout, stderr) => {
        expect(err).toBeNull();
        expect(stdout).toBe("I'm alive!");
        expect(stderr.trim())
          .toBe(`This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). The promise rejected with the reason:
test rejection`);
        done();
      });
    }));

  test('should show error-type promise rejection warnings by default', () =>
    new Promise<void>(done => {
      expect.assertions(3);

      const testScriptPath = path.resolve(__dirname, 'mode-warn-error.js');

      childProcess.execFile('node', [testScriptPath], { encoding: 'utf8' }, (err, stdout, stderr) => {
        expect(err).toBeNull();
        expect(stdout).toBe("I'm alive!");
        expect(stderr)
          .toContain(`This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). The promise rejected with the reason:
Error: test rejection
    at Object.<anonymous>`);
        done();
      });
    }));

  test('should not close process on unhandled rejection in strict mode', () =>
    new Promise<void>(done => {
      expect.assertions(4);

      const testScriptPath = path.resolve(__dirname, 'mode-strict.js');

      childProcess.execFile('node', [testScriptPath], { encoding: 'utf8' }, (err, stdout, stderr) => {
        expect(err).not.toBeNull();
        expect(err?.code).toBe(1);
        expect(stdout).not.toBe("I'm alive!");
        expect(stderr)
          .toContain(`This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). The promise rejected with the reason:
test rejection`);
        done();
      });
    }));

  test('should not close process or warn on unhandled rejection in none mode', () =>
    new Promise<void>(done => {
      expect.assertions(3);

      const testScriptPath = path.resolve(__dirname, 'mode-none.js');

      childProcess.execFile('node', [testScriptPath], { encoding: 'utf8' }, (err, stdout, stderr) => {
        expect(err).toBeNull();
        expect(stdout).toBe("I'm alive!");
        expect(stderr).toBe('');
        done();
      });
    }));

  test('captures exceptions for unhandled rejections', async () => {
    await createRunner(__dirname, 'scenario-warn.ts')
      .expect({
        event: {
          level: 'error',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'test rejection',
                mechanism: {
                  type: 'auto.node.onunhandledrejection',
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

  test('captures exceptions for unhandled rejections in strict mode', async () => {
    await createRunner(__dirname, 'scenario-strict.ts')
      .expect({
        event: {
          level: 'fatal',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'test rejection',
                mechanism: {
                  type: 'auto.node.onunhandledrejection',
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

  test('handles unhandled rejection in spans', async () => {
    let transactionEvent: Event | undefined;
    let errorEvent: Event | undefined;

    await createRunner(__dirname, 'scenario-with-span.ts')
      .expect({
        transaction: transaction => {
          transactionEvent = transaction;
        },
      })
      .expect({
        event: event => {
          errorEvent = event;
        },
      })
      .start()
      .completed();

    expect(transactionEvent).toBeDefined();
    expect(errorEvent).toBeDefined();

    expect(transactionEvent!.transaction).toBe('test-span');

    expect(transactionEvent!.contexts!.trace!.trace_id).toBe(errorEvent!.contexts!.trace!.trace_id);
    expect(transactionEvent!.contexts!.trace!.span_id).toBe(errorEvent!.contexts!.trace!.span_id);
  });

  test('handles unhandled rejection in spans that are ended early', async () => {
    let transactionEvent: Event | undefined;
    let errorEvent: Event | undefined;

    await createRunner(__dirname, 'scenario-with-span-ended.ts')
      .expect({
        transaction: transaction => {
          transactionEvent = transaction;
        },
      })
      .expect({
        event: event => {
          errorEvent = event;
        },
      })
      .start()
      .completed();

    expect(transactionEvent).toBeDefined();
    expect(errorEvent).toBeDefined();

    expect(transactionEvent!.transaction).toBe('test-span');

    expect(transactionEvent!.contexts!.trace!.trace_id).toBe(errorEvent!.contexts!.trace!.trace_id);
    expect(transactionEvent!.contexts!.trace!.span_id).toBe(errorEvent!.contexts!.trace!.span_id);
  });

  test('should not warn when AI_NoOutputGeneratedError or AbortError is rejected (default ignore)', () =>
    new Promise<void>(done => {
      expect.assertions(3);

      const testScriptPath = path.resolve(__dirname, 'ignore-default.js');

      childProcess.execFile('node', [testScriptPath], { encoding: 'utf8' }, (err, stdout, stderr) => {
        expect(err).toBeNull();
        expect(stdout).toBe("I'm alive!");
        expect(stderr).toBe(''); // No warning should be shown
        done();
      });
    }));

  test('should not warn when custom ignored error by name is rejected', () =>
    new Promise<void>(done => {
      expect.assertions(3);

      const testScriptPath = path.resolve(__dirname, 'ignore-custom-name.js');

      childProcess.execFile('node', [testScriptPath], { encoding: 'utf8' }, (err, stdout, stderr) => {
        expect(err).toBeNull();
        expect(stdout).toBe("I'm alive!");
        expect(stderr).toBe(''); // No warning should be shown
        done();
      });
    }));
});
