import * as childProcess from 'child_process';
import * as path from 'path';
import type { Event } from '@sentry/node';
import type { SerializedSession } from '@sentry/types';
import { conditionalTest } from '../../utils';

/** The output will contain logging so we need to find the line that parses as JSON */
function parseJsonLines<T extends unknown[]>(input: string, expected: number): T {
  const results = input
    .split('\n')
    .map(line => {
      const trimmed = line.startsWith('[ANR Worker] ') ? line.slice(13) : line;
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return undefined;
      }
    })
    .filter(a => a) as T;

  expect(results.length).toEqual(expected);

  return results;
}

conditionalTest({ min: 16 })('should report ANR when event loop blocked', () => {
  test('CJS', done => {
    expect.assertions(13);

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

      expect(event.contexts?.device?.arch).toBeDefined();
      expect(event.contexts?.app?.app_start_time).toBeDefined();
      expect(event.contexts?.os?.name).toBeDefined();
      expect(event.contexts?.culture?.timezone).toBeDefined();

      done();
    });
  });

  test('Legacy API', done => {
    // TODO (v8): Remove this old API and this test
    expect.assertions(9);

    const testScriptPath = path.resolve(__dirname, 'legacy.js');

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

  test('With --inspect', done => {
    expect.assertions(7);

    const testScriptPath = path.resolve(__dirname, 'basic.js');

    childProcess.exec(`node --inspect ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
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

  test('can exit', done => {
    const testScriptPath = path.resolve(__dirname, 'should-exit.js');
    let hasClosed = false;

    setTimeout(() => {
      expect(hasClosed).toBe(true);
      done();
    }, 5_000);

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      hasClosed = true;
    });
  });

  test('With session', done => {
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
