import * as Sentry from '@sentry/browser';

// Let's us test trace propagation
Sentry.init({
  environment: 'qa',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tunnel: 'http://localhost:3031/', // proxy server
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});
