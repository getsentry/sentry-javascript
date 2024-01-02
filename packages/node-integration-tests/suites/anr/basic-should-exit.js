const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  debug: true,
  autoSessionTracking: false,
  integrations: [new Sentry.Integrations.Anr({ captureStackTrace: true, anrThreshold: 200 })],
});
