import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

// These should not actually work, but still not error out
Sentry.metrics.count('test.counter', 1);
Sentry.metrics.gauge('test.gauge', 42);
Sentry.metrics.distribution('test.distribution', 200);
