const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const Redis = require('ioredis');

const redis = new Redis({ port: 6379 });

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Span',
      op: 'test-span',
    },
    async () => {
      try {
        await redis.set('test-key', 'test-value');

        await redis.get('test-key');
      } finally {
        await redis.disconnect();
      }
    },
  );
}

run();
