const Sentry = require('@sentry/node-core/light');
const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  transport: loggingTransport,
  enableLogs: true,
});

async function run() {
  Sentry.logger.info('test info log', { key: 'value' });
  Sentry.logger.error('test error log');

  await Sentry.flush();
}

void run();
