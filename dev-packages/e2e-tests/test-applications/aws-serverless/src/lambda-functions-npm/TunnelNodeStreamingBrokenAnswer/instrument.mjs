import * as Sentry from '@sentry/node';

Sentry.init({
  // The test's ingest on this port answers 200 and then breaks off mid-body.
  dsn: process.env.SENTRY_DSN.replace(':3031/', ':3033/'),
  debug: true,
  integrations: [Sentry.serveTunnelIntegration()],
});
