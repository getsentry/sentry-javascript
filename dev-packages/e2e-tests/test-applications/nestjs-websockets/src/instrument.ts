import * as Sentry from '@sentry/nestjs';

Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1,
  ...(process.env.E2E_USE_SENTRY_TRACE_PROVIDER === '1'
    ? {
        _experiments: {
          useSentryTraceProvider: true,
        },
      }
    : {}),
  transportOptions: {
    bufferSize: 1000,
  },
});
