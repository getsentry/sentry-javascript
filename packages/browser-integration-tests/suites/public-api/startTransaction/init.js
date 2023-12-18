import * as Sentry from '@sentry/browser';
import '@sentry/tracing';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  normalizeDepth: 10,
});
