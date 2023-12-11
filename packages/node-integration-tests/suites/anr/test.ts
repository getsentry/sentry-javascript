import * as childProcess from 'child_process';
import * as path from 'path';
import type { Event } from '@sentry/node';
import type { SerializedSession } from '@sentry/types';
import { parseSemver } from '@sentry/utils';

const NODE_VERSION = parseSemver(process.versions.node).major || 0;

/** The output will contain logging so we need to find the line that parses as JSON */
function parseJsonLines<T extends unknown[]>(input: string, expected: number): T {
  const results = input
    .split('\n')
    .map(line => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return undefined;
      }
    })
    .filter(a => a) as T;

  expect(results.length).toEqual(expected);

  return results;
}

describe('should report ANR when event loop blocked', () => {
  test('CJS', done => {
    if (NODE_VERSION < 12) {
      done();
      return;
    }

    expect.assertions(9);

    const testScriptPath = path.resolve(__dirname, 'basic.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const [event] = parseJsonLines<[Event]>(stdout, 1);

      expect(event.exception?.values?.[0].mechanism).toEqual({ type: 'ANR' });
      expect(event.exception?.values?.[0].type).toEqual('ApplicationNotResponding');
      expect(event.exception?.values?.[0].value).toEqual('Application Not Responding for at least 200 ms');
      expect(event.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThan(4);

      expect(event.exception?.values?.[0].stacktrace?.frames?.[2].function).toEqual('?');
      expect(event.exception?.values?.[0].stacktrace?.frames?.[3].function).toEqual('longWork');

      expect(event.contexts?.trace?.trace_id).toBeDefined();
      expect(event.contexts?.trace?.span_id).toBeDefined();

      done();
    });
  });

  test('ESM', done => {
    if (NODE_VERSION < 14) {
      done();
      return;
    }

    expect.assertions(7);

    const testScriptPath = path.resolve(__dirname, 'basic.mjs');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const [event] = parseJsonLines<[Event]>(stdout, 1);

      expect(event.exception?.values?.[0].mechanism).toEqual({ type: 'ANR' });
      expect(event.exception?.values?.[0].type).toEqual('ApplicationNotResponding');
      expect(event.exception?.values?.[0].value).toEqual('Application Not Responding for at least 200 ms');
      expect(event.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThanOrEqual(4);
      expect(event.exception?.values?.[0].stacktrace?.frames?.[2].function).toEqual('?');
      expect(event.exception?.values?.[0].stacktrace?.frames?.[3].function).toEqual('longWork');

      done();
    });
  });

  test('With session', done => {
    if (NODE_VERSION < 12) {
      done();
      return;
    }

    expect.assertions(9);

    const testScriptPath = path.resolve(__dirname, 'basic-session.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const [session, event] = parseJsonLines<[SerializedSession, Event]>(stdout, 2);

      expect(event.exception?.values?.[0].mechanism).toEqual({ type: 'ANR' });
      expect(event.exception?.values?.[0].type).toEqual('ApplicationNotResponding');
      expect(event.exception?.values?.[0].value).toEqual('Application Not Responding for at least 200 ms');
      expect(event.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThan(4);

      expect(event.exception?.values?.[0].stacktrace?.frames?.[2].function).toEqual('?');
      expect(event.exception?.values?.[0].stacktrace?.frames?.[3].function).toEqual('longWork');

      expect(session.status).toEqual('abnormal');
      expect(session.abnormal_mechanism).toEqual('anr_foreground');

      done();
    });
  });

  test('from forked process', done => {
    if (NODE_VERSION < 12) {
      done();
      return;
    }

    expect.assertions(7);

    const testScriptPath = path.resolve(__dirname, 'forker.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const [event] = parseJsonLines<[Event]>(stdout, 1);

      expect(event.exception?.values?.[0].mechanism).toEqual({ type: 'ANR' });
      expect(event.exception?.values?.[0].type).toEqual('ApplicationNotResponding');
      expect(event.exception?.values?.[0].value).toEqual('Application Not Responding for at least 200 ms');
      expect(event.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThan(4);

      expect(event.exception?.values?.[0].stacktrace?.frames?.[2].function).toEqual('?');
      expect(event.exception?.values?.[0].stacktrace?.frames?.[3].function).toEqual('longWork');

      done();
    });
  });
});
