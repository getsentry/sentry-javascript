import * as Sentry from '@sentry/node';
import Redis from 'ioredis';

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
