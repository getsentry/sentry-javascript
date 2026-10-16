import * as Sentry from '@sentry/react-router';

Sentry.init({
  dsn: process.env.E2E_TEST_TUNNEL ? 'http://public@localhost:3031/1337' : 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: process.env.E2E_TEST_TUNNEL ? true : `http://localhost:3031/`, // proxy server
});
