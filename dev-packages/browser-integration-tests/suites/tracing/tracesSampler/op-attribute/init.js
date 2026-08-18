import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampler: ({ attributes }) => {
    return attributes?.['sentry.op'] === 'custom.op' ? 1 : 0;
  },
});
