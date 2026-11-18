import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});
