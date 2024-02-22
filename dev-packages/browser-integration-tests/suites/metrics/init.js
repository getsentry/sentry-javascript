import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

Sentry.metrics.increment('increment');
Sentry.metrics.increment('increment');
Sentry.metrics.distribution('distribution', 42);
Sentry.metrics.distribution('distribution', 45);
Sentry.metrics.gauge('gauge', 5);
Sentry.metrics.gauge('gauge', 15);
Sentry.metrics.set('set', 'nope');
Sentry.metrics.set('set', 'another');
