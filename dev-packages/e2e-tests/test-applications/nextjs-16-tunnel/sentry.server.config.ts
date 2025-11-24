import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  // Use a fake but properly formatted Sentry SaaS DSN for tunnel route testing
  dsn: 'https://public@o12345.ingest.us.sentry.io/67890',
  // No tunnel option - using tunnelRoute from withSentryConfig
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  // debug: true,
});
