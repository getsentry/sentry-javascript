import Redis from 'ioredis';
import type { Route } from './+types/db-ioredis';

export async function loader() {
  const redis = new Redis({
    // Don't keep retrying forever if Redis goes away (e.g. on test teardown)
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    return { value };
  } finally {
    redis.disconnect();
  }
}

export default function DbIoredis(_props: Route.ComponentProps) {
  return <div>db-ioredis</div>;
}
