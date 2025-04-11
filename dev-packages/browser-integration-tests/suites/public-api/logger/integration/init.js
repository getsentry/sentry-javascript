import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  _experiments: {
    enableLogs: true,
  },
  integrations: [Sentry.consoleLoggingIntegration()],
});
