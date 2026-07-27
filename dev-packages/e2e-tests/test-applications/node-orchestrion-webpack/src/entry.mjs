import * as Sentry from '@sentry/node';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
});

await import('./app.mjs');
