import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

// consoleLoggingIntegration should not actually work, but still not error out
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1,
  integrations: [Sentry.consoleLoggingIntegration()],
});
