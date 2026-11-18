import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});
