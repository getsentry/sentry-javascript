import * as Sentry from '@sentry/browser';

window.Sentry = {
  ...Sentry,
  // Ensure this is _not_ set
  httpClientIntegration: undefined,
};

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [],
});
