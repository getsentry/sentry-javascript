const Sentry = require('@sentry/node');

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  integrations: [],
  tracesSampleRate: 1,
  tunnel: 'http://localhost:3031/', // proxy server
});
