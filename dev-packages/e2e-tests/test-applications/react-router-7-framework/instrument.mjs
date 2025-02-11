import * as Sentry from '@sentry/react-router';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  tracesSampleRate: 1.0,
});
