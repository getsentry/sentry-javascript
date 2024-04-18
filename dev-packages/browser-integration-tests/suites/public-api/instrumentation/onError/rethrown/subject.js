function run() {
  try {
    try {
      foo();
    } catch (e) {
      Sentry.captureException(e);
      throw e; // intentionally re-throw
    }
  } catch (e) {
    // simulate window.onerror without generating a Script error
    window.onerror('error', 'file.js', 1, 1, e);
  }
}

run();

Sentry.captureException(new Error('error 2'));
