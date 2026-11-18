import * as Sentry from '@sentry/react-router';

Sentry.init({
  traceLifecycle: process.env.E2E_TEST_TRACE_LIFECYCLE === 'static' ? 'static' : undefined,
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: `http://localhost:3031/`, // proxy server
});
