const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampleRate: 1.0,
  // Each request captures the same error, which Dedupe would drop after the first request.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});
