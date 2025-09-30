const Sentry = require('@sentry/node');

const IGNORE_SYMBOL = Symbol('ignore');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.onUnhandledRejectionIntegration({
      // Use default mode: 'warn' - integration is active but should ignore errors with the symbol
      ignore: [{ symbol: IGNORE_SYMBOL }],
    }),
  ],
});

// Create an error with the ignore symbol
class CustomError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CustomError';
    this[IGNORE_SYMBOL] = true;
  }
}

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

// This should be ignored by the symbol matcher and not produce a warning
Promise.reject(new CustomError('This error should be ignored by symbol'));
