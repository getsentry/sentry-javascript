const Sentry = require('../../../../dist');
const { assertSessions, constructStrippedSessionObject, BaseDummyTransport } = require('../test-utils');
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
  autoSessionTracking: true
});
/**
 * The following code snippet will throw multiple errors, and thereby send session updates everytime an error is
 * captured. However, the number of errors in the session should be capped at 1, regardless of how many errors there are
 */
for (let i = 0; i < 2; i++) {
  Sentry.captureException(new Error('hello world'));
}


