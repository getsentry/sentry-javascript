import * as Sentry from '@sentry/aws-serverless';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  debug: true,
  // Served on an API Gateway stage named `prod`, where the browser posts to `/prod/<path>`.
  integrations: [Sentry.serveTunnelIntegration({ basePath: '/prod' })],
});
