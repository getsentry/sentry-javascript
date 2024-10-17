import * as Sentry from '@sentry/remix';

Sentry.init({
  // TODO: replace with your Sentry DSN
  dsn: process.env.E2E_TEST_DSN,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
  autoInstrumentRemix: true,
});
