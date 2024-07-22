import * as Sentry from '@sentry/nuxt';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  integrations: [Sentry.browserTracingIntegration()]
});
