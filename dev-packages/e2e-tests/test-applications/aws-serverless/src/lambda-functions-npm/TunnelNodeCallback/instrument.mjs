import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  debug: true,
  integrations: [Sentry.serveTunnelIntegration()],
});
