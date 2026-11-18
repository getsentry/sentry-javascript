import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa',
  enableLogs: true,
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
});
