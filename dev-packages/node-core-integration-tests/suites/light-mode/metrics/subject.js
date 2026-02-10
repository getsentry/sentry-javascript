const Sentry = require('@sentry/node-core/light');
const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  transport: loggingTransport,
});

async function run() {
  Sentry.metrics.count('test.counter', 1, { attributes: { endpoint: '/api/test' } });
  Sentry.metrics.gauge('test.gauge', 42, { unit: 'millisecond', attributes: { server: 'test-1' } });
  Sentry.metrics.distribution('test.distribution', 200, { unit: 'second', attributes: { priority: 'high' } });

  await Sentry.flush();
}

void run();
