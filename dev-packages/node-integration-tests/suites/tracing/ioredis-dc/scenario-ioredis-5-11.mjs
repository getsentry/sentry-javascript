import * as Sentry from '@sentry/node';

async function run() {
  // Yield a microtick so the DC subscriber (deferred via Promise.resolve().then)
  // is registered before ioredis creates its native TracingChannels on import.
  await Promise.resolve();

  const { default: Redis } = await import('ioredis-5');
  const redisClient = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true });

  await redisClient.connect();

  await Sentry.startSpan(
    {
      name: 'Test Span IORedis 5.11 DC',
      op: 'test-span-ioredis-5-11-dc',
    },
    async () => {
      try {
        await redisClient.set('dc-test-key', 'test-value');
        await redisClient.set('dc-cache:test-key', 'test-value');

        await redisClient.set('dc-cache:test-key-ex', 'test-value', 'EX', 10);

        await redisClient.get('dc-test-key');
        await redisClient.get('dc-cache:test-key');
        await redisClient.get('dc-cache:unavailable-data');

        await redisClient.mget('dc-test-key', 'dc-cache:test-key', 'dc-cache:unavailable-data');
      } finally {
        await redisClient.disconnect();
      }
    },
  );
}

run();
