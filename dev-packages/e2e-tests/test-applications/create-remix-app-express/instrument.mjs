import * as Sentry from '@sentry/remix';
import process from 'process';

Sentry.init({
  tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
  ...(process.env.E2E_USE_SENTRY_TRACE_PROVIDER === '1'
    ? {
        _experiments: {
          useSentryTraceProvider: true,
        },
      }
    : {}),
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  dataCollection: { httpBodies: ['incomingRequest'] }, // Testing the FormData
  captureActionFormDataKeys: {
    file: true,
    text: true,
  },
});
