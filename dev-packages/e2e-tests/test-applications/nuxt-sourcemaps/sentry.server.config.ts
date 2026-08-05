import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});
