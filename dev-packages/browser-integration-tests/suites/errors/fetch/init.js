import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transportOptions: {
    fetchOptions: {
      // See: https://github.com/microsoft/playwright/issues/34497
      keepalive: false,
    },
  },
});
