const Sentry = require('../../../../dist');
const { assertSessions, constructStrippedSessionObject, BaseDummyTransport } = require('./test-utils');

let sessionCounter = 0;
process.on('exit', ()=> {
  if (process.exitCode !== 1) {
    console.log('SUCCESS: All application mode sessions were sent to node transport as expected');
  }
})

class DummyTransport extends BaseDummyTransport {
  sendSession(session) {
    sessionCounter++;
    if (sessionCounter === 1) {
      assertSessions(constructStrippedSessionObject(session),
        {
          init: true,
          status: 'exited',
          errors: 0,
          release: '1.1'
        }
      )
    }
    else {
      console.log('FAIL: Received way too many Sessions!');
      process.exit(1);
    }
    return super.sendSession(session);
  }
}

Sentry.init({
  dsn: 'http://test@example.com/1337',
  release: '1.1',
  transport: DummyTransport
});

/**
 * This script or process, start a Session on init object, and calls endSession on `beforeExit` of the process, which
 * sends a healthy session to the Server.
 */
