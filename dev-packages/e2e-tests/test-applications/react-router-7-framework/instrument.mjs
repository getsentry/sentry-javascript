import * as Sentry from '@sentry/react-router';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  tunnel: `http://localhost:3031/`, // proxy server
  // todo: grab from env
  // dsn: process.env.E2E_TEST_DSN,
  dsn: 'https://username@domain/123',
  tracesSampleRate: 1.0,
});
