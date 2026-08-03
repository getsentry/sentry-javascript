import { defineEventHandler } from '#imports';
import Redis from 'ioredis';

export default defineEventHandler(async () => {
  const redis = new Redis({
    // Don't keep retrying forever if Redis goes away (e.g. on test teardown)
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    await redis.set('test-key', 'test-value');
    return await redis.get('test-key');
  } finally {
    redis.disconnect();
  }
});
