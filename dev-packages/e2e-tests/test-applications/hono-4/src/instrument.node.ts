import * as Sentry from '@sentry/hono/node';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
});
