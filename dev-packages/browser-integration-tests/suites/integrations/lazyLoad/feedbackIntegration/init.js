import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [],
});

window.Sentry = {
  ...Sentry,
};
