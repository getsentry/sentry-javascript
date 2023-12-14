const Sentry = require('../../../../build/cjs');
const { assertSessions, constructStrippedSessionObject, validateSessionCountFunction } = require('../test-utils');
const { TextEncoder } = require('util');

const sessionCounts = {
  sessionCounter: 0,
  expectedSessions: 1,
};

validateSessionCountFunction(sessionCounts);

function makeDummyTransport() {
  return Sentry.createTransport({ recordDroppedEvent: () => undefined, textEncoder: new TextEncoder() }, req => {
    const payload = req.body
      .split('\n')
      .filter(l => !!l)
      .map(e => JSON.parse(e));
    const isSessionPayload = payload[1].type === 'session';

    if (isSessionPayload) {
      sessionCounts.sessionCounter++;

      assertSessions(constructStrippedSessionObject(payload[2]), {
        init: true,
        status: 'crashed',
        errors: 1,
        release: '1.1',
      });
    }

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
 * The following code snippet will throw an exception of `mechanism.handled` equal to `false`, and so this session
 * is treated as a Crashed Session.
 * In this case, we have two session updates sent; First Session sent is due to the call to CaptureException that
 * extracts event data and uses it to update the Session and sends it. The second session update is sent on the
 * `beforeExit` event which happens right before the process exits.
 */
new Promise((resolve, reject) => {
  reject();
}).then(() => {
  console.log('Promise Resolved');
});
