import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  tunnel: 'http://localhost:3031/', // proxy server
  debug: !!process.env.DEBUG,
  // Several tests trigger the same server error one after another, which Dedupe would drop.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});
