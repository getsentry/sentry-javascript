function assertSessions(actual, expected) {
  // biome-ignore lint/style/noParameterAssign: Disable.
  actual = JSON.stringify(actual);
  // biome-ignore lint/style/noParameterAssign: Disable.
  expected = JSON.stringify(expected);
  if (actual !== expected) {
    process.stdout.write(`Expected Session:\n  ${expected}\nActual Session:\n  ${actual}`);
    process.exit(1);
  }
}

function constructStrippedSessionObject(actual) {
  const {
    init,
    status,
    errors,
    attrs: { release },
    did,
  } = actual;
  return { init, status, errors, release, did };
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

module.exports = { assertSessions, constructStrippedSessionObject, validateSessionCountFunction };
