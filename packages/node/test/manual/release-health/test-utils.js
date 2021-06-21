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

function validateSessionCountFunction(sessionCounts) {
  process.on('exit', exitCode => {
    const { sessionCounter, expectedSessions } = sessionCounts;
    if (sessionCounter !== expectedSessions) {
      console.log(`FAIL: Expected ${expectedSessions} Sessions, Received ${sessionCounter}.`);
      process.exitCode = 1;
    }
    if ((exitCode === 0) & !process.exitCode) {
      console.log('SUCCESS: All application mode sessions were sent to node transport as expected');
    }
  });
}

module.exports = { assertSessions, constructStrippedSessionObject, BaseDummyTransport, validateSessionCountFunction };
