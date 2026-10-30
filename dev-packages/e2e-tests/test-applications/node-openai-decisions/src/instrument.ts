import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa',
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1,
});
