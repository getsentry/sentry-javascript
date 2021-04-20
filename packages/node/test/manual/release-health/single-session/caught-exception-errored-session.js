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
          status: 'ok',
          errors: 1,
          release: '1.1'
        }
      )
    }
    else if (sessionCounter === 2) {
      assertSessions(constructStrippedSessionObject(session),
        {
          init: false,
          status: 'exited',
          errors: 1,
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
  transport: DummyTransport,
});

/**
 * The following code snippet will capture exceptions of `mechanism.handled` equal to `true`, and so these sessions
 * are treated as Errored Sessions.
 * In this case, we have two session updates sent; First Session sent is due to the call to CaptureException that
 * extracts event data and uses it to update the Session and sends it. The second session update is sent on the
 * `beforeExit` event which happens right before the process exits.
 */
try {
  throw new Error('hey there')
}
catch(e) {
  Sentry.captureException(e);
}
