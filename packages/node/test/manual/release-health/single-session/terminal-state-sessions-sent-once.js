const Sentry = require('../../../../dist');
const {
  assertSessions,
  constructStrippedSessionObject,
  BaseDummyTransport,
  validateSessionCountFunction,
} = require('../test-utils');

const sessionCounts = {
  sessionCounter: 0,
  expectedSessions: 1,
};

validateSessionCountFunction(sessionCounts);

class DummyTransport extends BaseDummyTransport {
  sendSession(session) {
    sessionCounts.sessionCounter++;

    assertSessions(constructStrippedSessionObject(session), {
      init: true,
      status: 'crashed',
      errors: 1,
      release: '1.1',
    });

    return super.sendSession(session);
  }
}

Sentry.init({
  dsn: 'http://test@example.com/1337',
  release: '1.1',
  transport: DummyTransport,
  autoSessionTracking: true,
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
