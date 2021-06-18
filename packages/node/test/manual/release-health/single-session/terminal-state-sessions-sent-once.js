const Sentry = require('../../../../dist');
const { assertSessions, constructStrippedSessionObject, BaseDummyTransport } = require('../test-utils');

let sessionCounter = 0;
process.on('exit', () => {
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
          status: 'crashed',
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
 * The following code snippet will throw an exception of `mechanism.handled` equal to `false`, and so this session
 * is treated as a Crashed Session.
 * However we want to ensure that once a crashed terminal state is achieved, no more session updates are sent regardless
 * of whether more crashes happen or not
 */
new Promise(function(resolve, reject) {
  reject();
}).then(function() {
  console.log('Promise Resolved');
});

new Promise(function(resolve, reject) {
  reject();
}).then(function() {
  console.log('Promise Resolved');
});
