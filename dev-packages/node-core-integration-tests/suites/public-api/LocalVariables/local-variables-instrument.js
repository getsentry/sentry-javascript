const Sentry = require('@sentry/node-core');
const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  includeLocalVariables: true,
  transport: loggingTransport,
});

setupOtel(client);
