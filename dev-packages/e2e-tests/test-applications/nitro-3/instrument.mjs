import * as Sentry from '@sentry/nitro';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_TUNNEL ? 'http://public@localhost:3031/1337' : process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  integrations: process.env.E2E_TEST_TUNNEL ? [Sentry.serveTunnelIntegration()] : [],
  tracesSampleRate: 1,
});
