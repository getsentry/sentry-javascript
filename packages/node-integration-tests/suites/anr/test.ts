import type { Event } from '@sentry/node';
import { parseSemver } from '@sentry/utils';
import * as childProcess from 'child_process';
import * as path from 'path';

const NODE_VERSION = parseSemver(process.versions.node).major || 0;

test('should report ANR when event loop blocked', done => {
  // The stack trace is different when node < 12
  const testFramesDetails = NODE_VERSION >= 12;

  expect.assertions(testFramesDetails ? 6 : 4);

  const testScriptPath = path.resolve(__dirname, 'scenario.js');

  childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
    const event = JSON.parse(stdout) as Event;

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
