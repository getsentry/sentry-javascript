const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.onUnhandledRejectionIntegration({
      // Use default mode: 'warn' - integration is active but should ignore CustomIgnoredError
      ignore: [{ name: 'CustomIgnoredError' }],
    }),
  ],
});

// Create a custom error that should be ignored
class CustomIgnoredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CustomIgnoredError';
  }
}

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

// This should be ignored by the custom ignore matcher and not produce a warning
Promise.reject(new CustomIgnoredError('This error should be ignored'));
