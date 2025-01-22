const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

Sentry.captureException(new Error('Test Error'));

// some more post context
