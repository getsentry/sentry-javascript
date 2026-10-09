import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  // setMeasurement is a legacy transaction API without a span v2 representation.
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  normalizeDepth: 10,
});
