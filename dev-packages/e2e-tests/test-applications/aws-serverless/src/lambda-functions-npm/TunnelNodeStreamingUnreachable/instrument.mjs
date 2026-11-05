import * as Sentry from '@sentry/node';

Sentry.init({
  // Nothing listens on this port, so forwarding a tunnel request fails after the tunnel claimed it.
  dsn: process.env.SENTRY_DSN.replace(':3031/', ':3032/'),
  debug: true,
  integrations: [Sentry.serveTunnelIntegration()],
});
