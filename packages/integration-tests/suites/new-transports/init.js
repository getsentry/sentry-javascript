import * as Sentry from '@sentry/browser';
// eslint-disable-next-line no-unused-vars
import '@sentry/tracing';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  _experiments: {
    newTransport: true,
  },
  tracesSampleRate: 1.0,
});
