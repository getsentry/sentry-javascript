const Sentry = require('../../../../dist');
const { assertSessions, constructStrippedSessionObject, BaseDummyTransport } = require('../test-utils');

class DummyTransport extends BaseDummyTransport {
  sendSession(session) {
    assertSessions(constructStrippedSessionObject(session), {
      init: true,
      status: 'crashed',
      errors: 1,
      release: '1.1',
    });

    // We need to explicitly exit process early here to allow for 0 exit code
    process.exit(0);
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
 * is considered a Crashed Session.
 * In this case, we have only session update that is sent, which is sent due to the call to CaptureException that
 * extracts event data and uses it to update the Session and send it. No secondary session update in this case because
 * we explicitly exit the process in the onUncaughtException handler and so the `beforeExit` event is not fired.
 */
throw new Error('test error');
