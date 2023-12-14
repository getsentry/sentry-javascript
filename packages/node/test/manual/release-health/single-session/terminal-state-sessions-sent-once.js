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
 * However we want to ensure that once a crashed terminal state is achieved, no more session updates are sent regardless
 * of whether more crashes happen or not
 */
new Promise((resolve, reject) => {
  reject();
}).then(() => {
  console.log('Promise Resolved');
});

new Promise((resolve, reject) => {
  reject();
}).then(() => {
  console.log('Promise Resolved');
});
