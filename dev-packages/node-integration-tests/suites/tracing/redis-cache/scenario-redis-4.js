const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.redisIntegration({ cachePrefixes: ['redis-cache:'] })],
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const { createClient } = require('redis-4');

async function run() {
  const redisClient = await createClient().connect();

  await Sentry.startSpan(
    {
      name: 'Test Span Redis 4',
      op: 'test-span-redis-4',
    },
    async () => {
      try {
        await redisClient.set('redis-test-key', 'test-value');
        await redisClient.set('redis-cache:test-key', 'test-value');

        await redisClient.set('redis-cache:test-key-set-EX', 'test-value', { EX: 10 });
        await redisClient.setEx('redis-cache:test-key-setex', 10, 'test-value');

        await redisClient.get('redis-test-key');
        await redisClient.get('redis-cache:test-key');
        await redisClient.get('redis-cache:unavailable-data');

        await redisClient.mGet(['redis-test-key', 'redis-cache:test-key', 'redis-cache:unavailable-data']);
      } finally {
        await redisClient.disconnect();
      }
    },
  );
}

run();
