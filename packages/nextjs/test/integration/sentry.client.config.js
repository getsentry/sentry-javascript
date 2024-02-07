import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampler: () => true,
  debug: process.env.SDK_DEBUG,
});
