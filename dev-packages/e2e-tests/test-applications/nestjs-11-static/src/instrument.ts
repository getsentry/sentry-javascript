import * as Sentry from '@sentry/nestjs';

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  transportOptions: {
    // We expect the app to send a lot of events in a short time
    bufferSize: 1000,
  },
  // The cron job throws the same error on every run, which Dedupe would drop after the first run.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});
