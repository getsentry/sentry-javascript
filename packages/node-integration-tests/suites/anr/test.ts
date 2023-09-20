import type { Event } from '@sentry/node';
import * as childProcess from 'child_process';
import * as path from 'path';

test('should report ANR when event loop blocked', done => {
  expect.assertions(5);

  const testScriptPath = path.resolve(__dirname, 'scenario.js');

  childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
    const event = JSON.parse(stdout) as Event;

    expect(event.exception?.values?.[0].mechanism).toEqual({ type: 'ANR' });
    expect(event.exception?.values?.[0].type).toEqual('ApplicationNotResponding');
    expect(event.exception?.values?.[0].value).toEqual('Application Not Responding for at least 200 ms');
    expect(event.exception?.values?.[0].stacktrace?.frames?.[2].function).toEqual('?');
    expect(event.exception?.values?.[0].stacktrace?.frames?.[3].function).toEqual('longWork');

    done();
  });
});
