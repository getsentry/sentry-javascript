const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  includeLocalVariables: true,
  transport: loggingTransport,
});
