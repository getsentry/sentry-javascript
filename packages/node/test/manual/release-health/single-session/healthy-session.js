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
      status: 'exited',
      errors: 0,
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
 * This script or process, start a Session on init object, and calls endSession on `beforeExit` of the process, which
 * sends a healthy session to the Server.
 */
