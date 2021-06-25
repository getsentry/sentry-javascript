function assertSessions(actual, expected) {
  actual = JSON.stringify(actual);
  expected = JSON.stringify(expected);
  if (actual !== expected) {
    process.stdout.write(`Expected Session:\n  ${expected}\nActual Session:\n  ${actual}`);
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

function validateSessionCountFunction(sessionCounts) {
  process.on('exit', () => {
    const { sessionCounter, expectedSessions } = sessionCounts;
    if (sessionCounter !== expectedSessions) {
      process.stdout.write(`Expected Session Count: ${expectedSessions}\nActual Session Count:   ${sessionCounter}`);
      process.exitCode = 1;
    }
  });
}

module.exports = { assertSessions, constructStrippedSessionObject, BaseDummyTransport, validateSessionCountFunction };
