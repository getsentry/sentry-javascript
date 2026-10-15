import * as Sentry from '@sentry/nitro';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_TUNNEL ? 'http://public@localhost:3031/1337' : process.env.E2E_TEST_DSN,
  tunnel: process.env.E2E_TEST_TUNNEL ? true : `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});
