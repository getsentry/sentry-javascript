import * as Sentry from '@sentry/node';
import { createClient } from 'redis-5';

async function run() {
  const redisClient = await createClient().connect();

  await Sentry.startSpan(
    {
      name: 'Test Span Redis 5',
      op: 'test-span-redis-5',
    },
    async () => {
      try {
        await redisClient.set('redis-5-test-key', 'test-value');
        await redisClient.set('redis-5-cache:test-key', 'test-value');

        await redisClient.set('redis-5-cache:test-key-set-EX', 'test-value', { EX: 10 });
        await redisClient.setEx('redis-5-cache:test-key-setex', 10, 'test-value');

        await redisClient.get('redis-5-test-key');
        await redisClient.get('redis-5-cache:test-key');
        await redisClient.get('redis-5-cache:unavailable-data');

        await redisClient.mGet(['redis-5-test-key', 'redis-5-cache:test-key', 'redis-5-cache:unavailable-data']);

        // MULTI/EXEC produces one span per queued command, all ended together on exec
        await redisClient.multi().set('redis-5-multi-key', 'multi-value').get('redis-5-multi-key').exec();

        // a failing command should produce a span with an error status
        // (INCR on a non-integer string value rejects)
        await redisClient.incr('redis-5-test-key').catch(() => {});
      } finally {
        await redisClient.disconnect();
      }
    },
  );
}

run();
