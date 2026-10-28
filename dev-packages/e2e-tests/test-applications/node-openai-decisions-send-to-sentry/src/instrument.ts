import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1,
});
