import * as Sentry from '@sentry/hono/node';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  ...(process.env.E2E_USE_SENTRY_TRACE_PROVIDER === '1'
    ? {
        _experiments: {
          useSentryTraceProvider: true,
        },
      }
    : {}),
  tunnel: 'http://localhost:3031/',
});
