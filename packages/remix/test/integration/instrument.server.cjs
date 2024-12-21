const Sentry = require('@sentry/remix');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
  tracePropagationTargets: ['example.org'],
  autoInstrumentRemix: process.env.USE_OTEL === '1',
});
