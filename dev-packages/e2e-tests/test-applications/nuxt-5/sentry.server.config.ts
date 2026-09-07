import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  tunnel: 'http://localhost:3031/', // proxy server
});
