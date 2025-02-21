import * as Sentry from '@sentry/remix';
import * as process from 'process';

Sentry.init({
  tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  integrations: [Sentry.nativeNodeFetchIntegration()],
});
