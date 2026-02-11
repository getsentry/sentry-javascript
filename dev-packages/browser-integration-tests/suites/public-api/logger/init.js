import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  // purposefully testing against the experimental flag here
  _experiments: {
    enableLogs: true,
  },
});
