import * as Sentry from '@sentry/browser';

Sentry.init({
  environment: 'qa',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/',
});
