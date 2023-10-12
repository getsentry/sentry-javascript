import type { Event } from '@sentry/node';
import { parseSemver } from '@sentry/utils';
import * as childProcess from 'child_process';
import * as path from 'path';

const NODE_VERSION = parseSemver(process.versions.node).major || 0;

/** The output will contain logging so we need to find the line that parses as JSON */
function parseJsonLine<T>(input: string): T {
  return (
    input
      .split('\n')
      .map(line => {
        try {
          return JSON.parse(line) as T;
        } catch {
          return undefined;
        }
      })
      .filter(a => a) as T[]
  )[0];
}

describe('should report ANR when event loop blocked', () => {
  test('CJS', done => {
    // The stack trace is different when node < 12
    const testFramesDetails = NODE_VERSION >= 12;

    expect.assertions(testFramesDetails ? 6 : 4);

    const testScriptPath = path.resolve(__dirname, 'basic.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const event = parseJsonLine<Event>(stdout);

      expect(event.exception?.values?.[0].mechanism).toEqual({ type: 'ANR' });
      expect(event.exception?.values?.[0].type).toEqual('ApplicationNotResponding');
      expect(event.exception?.values?.[0].value).toEqual('Application Not Responding for at least 200 ms');
      expect(event.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThan(4);

      if (testFramesDetails) {
        expect(event.exception?.values?.[0].stacktrace?.frames?.[2].function).toEqual('?');
        expect(event.exception?.values?.[0].stacktrace?.frames?.[3].function).toEqual('longWork');
      }

      done();
    });
  });

  test('ESM', done => {
    if (NODE_VERSION < 14) {
      done();
      return;
    }

    expect.assertions(6);

    const testScriptPath = path.resolve(__dirname, 'basic.mjs');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const event = parseJsonLine<Event>(stdout);

      expect(event.exception?.values?.[0].mechanism).toEqual({ type: 'ANR' });
      expect(event.exception?.values?.[0].type).toEqual('ApplicationNotResponding');
      expect(event.exception?.values?.[0].value).toEqual('Application Not Responding for at least 200 ms');
      expect(event.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThan(4);
      expect(event.exception?.values?.[0].stacktrace?.frames?.[2].function).toEqual('?');
      expect(event.exception?.values?.[0].stacktrace?.frames?.[3].function).toEqual('longWork');

      done();
    });
  });

  test('from forked process', done => {
    // The stack trace is different when node < 12
    const testFramesDetails = NODE_VERSION >= 12;

    expect.assertions(testFramesDetails ? 6 : 4);

    const testScriptPath = path.resolve(__dirname, 'forker.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const event = parseJsonLine<Event>(stdout);

      expect(event.exception?.values?.[0].mechanism).toEqual({ type: 'ANR' });
      expect(event.exception?.values?.[0].type).toEqual('ApplicationNotResponding');
      expect(event.exception?.values?.[0].value).toEqual('Application Not Responding for at least 200 ms');
      expect(event.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThan(4);

      if (testFramesDetails) {
        expect(event.exception?.values?.[0].stacktrace?.frames?.[2].function).toEqual('?');
        expect(event.exception?.values?.[0].stacktrace?.frames?.[3].function).toEqual('longWork');
      }

      done();
    });
  });
});
