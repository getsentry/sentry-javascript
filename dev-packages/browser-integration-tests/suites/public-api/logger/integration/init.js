import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  enableLogs: true,
  // Purposefully specifying the experimental flag here
  // to ensure the top level option is used instead.
  _experiments: {
    enableLogs: false,
  },
  integrations: [Sentry.consoleLoggingIntegration()],
});
