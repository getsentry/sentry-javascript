const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.redisIntegration({ cachePrefixes: ['ioredis-cache:'] })],
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

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
        await redis.set('ioredis-cache:test-key', 'test-value');

        await redis.set('ioredis-cache:test-key-set-EX', 'test-value', 'EX', 10);
        await redis.setex('ioredis-cache:test-key-setex', 10, 'test-value');

        await redis.get('test-key');
        await redis.get('ioredis-cache:test-key');
        await redis.get('ioredis-cache:unavailable-data');

        await redis.mget('test-key', 'ioredis-cache:test-key', 'ioredis-cache:unavailable-data');
      } finally {
        await redis.disconnect();
      }
    },
  );
}

run();
