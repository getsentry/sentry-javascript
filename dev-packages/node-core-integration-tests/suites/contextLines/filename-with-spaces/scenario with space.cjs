const Sentry = require('@sentry/node-core');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

Sentry.captureException(new Error('Test Error'));

// some more post context
