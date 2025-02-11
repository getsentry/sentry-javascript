import * as Sentry from '@sentry/react-router';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  tunnel: `http://localhost:3031/`, // proxy server
  dsn: process.env.E2E_TEST_DSN,
  tracesSampleRate: 1.0,
});
