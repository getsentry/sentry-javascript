import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});
