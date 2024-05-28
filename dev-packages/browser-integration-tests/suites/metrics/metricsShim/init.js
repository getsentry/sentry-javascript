import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

// This should not fail
Sentry.metrics.increment('increment');
Sentry.metrics.distribution('distribution', 42);
Sentry.metrics.gauge('gauge', 5);
Sentry.metrics.set('set', 'nope');
