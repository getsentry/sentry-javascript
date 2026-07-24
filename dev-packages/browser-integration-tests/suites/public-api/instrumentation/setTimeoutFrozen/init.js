import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  // We assert on the debug message, so we need to enable debug mode
  debug: true,
});
