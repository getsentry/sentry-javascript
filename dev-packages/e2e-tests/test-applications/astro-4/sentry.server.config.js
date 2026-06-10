import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  ...(process.env.E2E_USE_SENTRY_TRACE_PROVIDER === '1'
    ? {
        _experiments: {
          useSentryTraceProvider: true,
        },
      }
    : {}),
  spotlight: true,
  tunnel: 'http://localhost:3031/', // proxy server
});
