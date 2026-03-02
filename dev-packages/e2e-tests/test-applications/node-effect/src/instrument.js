import * as Sentry from '@sentry/node';

Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1,
  enableLogs: true,
});
