import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      environment: 'qa', // dynamic sampling bias to keep transactions
      dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
      tunnel: `http://localhost:3031/`, // proxy server
      tracesSampleRate: 1,
      ...(process.env.NEXT_RUNTIME === 'nodejs' && process.env.E2E_USE_SENTRY_TRACE_PROVIDER === '1'
        ? {
            _experiments: {
              useSentryTraceProvider: true,
            },
          }
        : {}),
      dataCollection: { userInfo: true },
      transportOptions: {
        // We are doing a lot of events at once in this test app
        bufferSize: 1000,
      },
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
