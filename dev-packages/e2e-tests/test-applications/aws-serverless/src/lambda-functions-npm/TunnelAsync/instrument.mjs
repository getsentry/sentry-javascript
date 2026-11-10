import * as Sentry from '@sentry/aws-serverless';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  debug: true,
  integrations: [Sentry.serveTunnelIntegration()],
});
