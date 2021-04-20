function assertSessions(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error('FAILED: Sessions do not match');
    process.exit(1);
  }
}

function constructStrippedSessionObject(actual) {
  const { init, status, errors, release, did } = actual;
  return { init, status, errors, release, did };
}

class BaseDummyTransport {
  sendEvent(event) {
    return Promise.resolve({
      status: 'success',
    });
  }
  sendSession(session) {
    return Promise.resolve({
      status: 'success',
    });
  }
  close(timeout) {
    return Promise.resolve(true);
  }
}

module.exports = { assertSessions, constructStrippedSessionObject, BaseDummyTransport };
