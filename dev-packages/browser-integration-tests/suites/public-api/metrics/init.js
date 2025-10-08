import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  _experiments: {
    enableTraceMetrics: true,
  },
  release: '1.0.0',
  environment: 'test',
  autoSessionTracking: false, // Was causing session envelopes to be sent
});
