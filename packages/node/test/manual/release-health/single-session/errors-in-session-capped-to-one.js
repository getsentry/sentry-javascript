const Sentry = require('../../../../build/cjs');
const {
  assertSessions,
  constructStrippedSessionObject,
  validateSessionCountFunction,
} = require('../test-utils');

const sessionCounts = {
  sessionCounter: 0,
  expectedSessions: 2,
};

validateSessionCountFunction(sessionCounts);

function makeDummyTransport() {
  return Sentry.createTransport({}, req => {
    if (req.category === 'session') {
      sessionCounts.sessionCounter++;
      const sessionEnv = req.body.split('\n').map(e => JSON.parse(e));

      if (sessionCounts.sessionCounter === 1) {
        assertSessions(constructStrippedSessionObject(sessionEnv[2]), {
          init: true,
          status: 'ok',
          errors: 1,
          release: '1.1',
        });
      }

      if (sessionCounts.sessionCounter === 2) {
        assertSessions(constructStrippedSessionObject(sessionEnv[2]), {
          init: false,
          status: 'exited',
          errors: 1,
          release: '1.1',
        });
      }
    }

    return Promise.resolve({
      statusCode: 200,
    });
  })
}

Sentry.init({
  dsn: 'http://test@example.com/1337',
  release: '1.1',
  transport: makeDummyTransport,
  autoSessionTracking: true,
});
/**
 * The following code snippet will throw multiple errors, and thereby send session updates everytime an error is
 * captured. However, the number of errors in the session should be capped at 1, regardless of how many errors there are
 */
for (let i = 0; i < 2; i++) {
  Sentry.captureException(new Error('hello world'));
}
