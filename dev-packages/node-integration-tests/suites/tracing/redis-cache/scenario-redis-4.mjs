import * as Sentry from '@sentry/node';
import { createClient } from 'redis-4';

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
