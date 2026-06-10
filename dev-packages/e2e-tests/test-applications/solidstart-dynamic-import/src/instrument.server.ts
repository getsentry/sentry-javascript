import * as Sentry from '@sentry/solidstart';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  ...(process.env.E2E_USE_SENTRY_TRACE_PROVIDER === '1'
    ? {
        _experiments: {
          useSentryTraceProvider: true,
        },
      }
    : {}),
  tunnel: 'http://localhost:3031/', // proxy server
  debug: !!process.env.DEBUG,
});
