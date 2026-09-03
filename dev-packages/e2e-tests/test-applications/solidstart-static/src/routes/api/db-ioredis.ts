import { json } from '@solidjs/router';
import Redis from 'ioredis';

export async function GET() {
  const redis = new Redis({
    // Don't keep retrying forever if Redis goes away (e.g. on test teardown)
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    return json({ value });
  } finally {
    redis.disconnect();
  }
}
