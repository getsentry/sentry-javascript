import * as Sentry from '@sentry/react-router';

Sentry.init({
  dsn: process.env.E2E_TEST_TUNNEL ? 'http://public@localhost:3031/1337' : 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: `http://localhost:3031/`, // proxy server
  // The tunnel variants also accept another app's DSN, so the server serves more than one tunnel path.
  integrations: process.env.E2E_TEST_TUNNEL
    ? [Sentry.serveTunnelIntegration({ allowedDsns: ['http://other@localhost:3031/1338'] })]
    : [],
});
