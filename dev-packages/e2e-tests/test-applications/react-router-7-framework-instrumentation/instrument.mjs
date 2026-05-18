import * as Sentry from '@sentry/react-router';

// Initialize Sentry early (before the server starts)
// The server instrumentations are created in entry.server.tsx
Sentry.init({
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  ...(process.env.E2E_USE_SENTRY_TRACE_PROVIDER === '1'
    ? {
        _experiments: {
          useSentryTraceProvider: true,
        },
      }
    : {}),
  tunnel: `http://localhost:3031/`, // proxy server
});
