const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.onUnhandledRejectionIntegration({ mode: 'strict' })],
});

setTimeout(() => {
  // should not be called
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

Promise.reject('test rejection');
