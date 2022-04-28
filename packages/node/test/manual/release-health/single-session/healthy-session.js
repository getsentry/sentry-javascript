const Sentry = require('../../../../build/cjs');
const { assertSessions, constructStrippedSessionObject, validateSessionCountFunction } = require('../test-utils');

const sessionCounts = {
  sessionCounter: 0,
  expectedSessions: 1,
};

validateSessionCountFunction(sessionCounts);

function makeDummyTransport() {
  return Sentry.createTransport({ recordDroppedEvent: () => undefined }, req => {
    sessionCounts.sessionCounter++;
    const sessionEnv = req.body.split('\n').map(e => JSON.parse(e));

    assertSessions(constructStrippedSessionObject(sessionEnv[2]), {
      init: true,
      status: 'exited',
      errors: 0,
      release: '1.1',
    });

    return Promise.resolve({
      statusCode: 200,
    });
  });
}

Sentry.init({
  dsn: 'http://test@example.com/1337',
  release: '1.1',
  transport: makeDummyTransport,
  autoSessionTracking: true,
});

/**
 * This script or process, start a Session on init object, and calls endSession on `beforeExit` of the process, which
 * sends a healthy session to the Server.
 */
