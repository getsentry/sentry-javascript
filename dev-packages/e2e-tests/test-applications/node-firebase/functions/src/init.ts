import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [Sentry.firebaseIntegration()],
  defaultIntegrations: false,
  tunnel: `http://localhost:3031/`, // proxy server
});
