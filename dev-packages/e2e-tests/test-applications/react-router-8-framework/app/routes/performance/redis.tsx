import Redis from 'ioredis';
import type { Route } from './+types/redis';

// workerd does not allow a socket connect at module scope, so the client is made in the loader.
let redis: Redis | undefined;

export async function loader() {
  redis ??= new Redis();
  const key = 'cache:greeting';
  await redis.set(key, 'hello from react-router');
  const value = await redis.get(key);

  return { value };
}

export default function RedisPage({ loaderData }: Route.ComponentProps) {
  const { value } = loaderData;
  return (
    <div>
      <h1>Redis Page</h1>
      <div id="redis-value">{value}</div>
    </div>
  );
}
