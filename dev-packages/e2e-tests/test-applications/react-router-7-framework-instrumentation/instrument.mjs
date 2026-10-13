import * as Sentry from '@sentry/react-router';

Sentry.init({
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: `http://localhost:3031/`, // proxy server
  // Several tests trigger the same server error one after another, which Dedupe would drop.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});
