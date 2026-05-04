const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.redisIntegration({ cachePrefixes: ['dc-cache:'] })],
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const { createClient } = require('redis-5');

async function run() {
  const redisClient = await createClient({ socket: { host: '127.0.0.1', port: 6379 } }).connect();

  await Sentry.startSpan(
    {
      name: 'Test Span Redis 5 DC',
      op: 'test-span-redis-5-dc',
    },
    async () => {
      try {
        await redisClient.set('dc-test-key', 'test-value');
        await redisClient.set('dc-cache:test-key', 'test-value');

        await redisClient.set('dc-cache:test-key-ex', 'test-value', { EX: 10 });

        await redisClient.get('dc-test-key');
        await redisClient.get('dc-cache:test-key');
        await redisClient.get('dc-cache:unavailable-data');

        await redisClient.mGet(['dc-test-key', 'dc-cache:test-key', 'dc-cache:unavailable-data']);
      } finally {
        await redisClient.disconnect();
      }
    },
  );
}

run();
