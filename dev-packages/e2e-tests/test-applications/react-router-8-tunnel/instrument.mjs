import * as Sentry from '@sentry/react-router';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  // A second DSN makes the server serve more than one tunnel path.
  integrations: [Sentry.serveTunnelIntegration({ allowedDsns: ['http://other@localhost:3031/1338'] })],
  tracesSampleRate: 1,
});
