import * as Sentry from '@sentry/node';

Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});
