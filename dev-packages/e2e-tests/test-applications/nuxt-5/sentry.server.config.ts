import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: process.env.E2E_TEST_TUNNEL ? 'http://public@localhost:3031/1337' : 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  tunnel: process.env.E2E_TEST_TUNNEL ? true : 'http://localhost:3031/', // proxy server
  // Several tests trigger the same server error one after another, which Dedupe would drop.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});
