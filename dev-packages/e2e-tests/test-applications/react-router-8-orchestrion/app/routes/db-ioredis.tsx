import Redis from 'ioredis';

// Page route (not a loader-only resource route): `@sentry/react-router` only
// renames the `http.server` transaction to the matched route (`GET /db-ioredis`)
// for rendered routes, so the orchestrion-injected ioredis spans land on a
// per-route transaction rather than the Express catch-all `GET /{*splat}`.
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
