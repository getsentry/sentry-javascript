import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: 'http://localhost:27496/', // proxy server
  tracesSampleRate: 1.0,
  debug: true,
});
