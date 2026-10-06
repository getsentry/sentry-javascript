import Redis from 'ioredis';

// Page route (not a loader-only resource route): so the http.server
// transaction is renamed to the matched route (`GET db-ioredis`) and the
// orchestrion-injected ioredis spans land on a per-route transaction.
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

export default function DbIoredis() {
  return <div>db-ioredis</div>;
}
