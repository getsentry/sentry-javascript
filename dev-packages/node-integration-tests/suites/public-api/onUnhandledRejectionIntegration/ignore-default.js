const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  // Use default mode: 'warn' - integration is active but should ignore AI_NoOutputGeneratedError
});

// Create an error with the name that should be ignored by default
class AI_NoOutputGeneratedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AI_NoOutputGeneratedError';
  }
}

class AbortError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbortError';
  }
}

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

// These should be ignored by default and not produce a warning
Promise.reject(new AI_NoOutputGeneratedError('Stream aborted'));
Promise.reject(new AbortError('Stream aborted'));
