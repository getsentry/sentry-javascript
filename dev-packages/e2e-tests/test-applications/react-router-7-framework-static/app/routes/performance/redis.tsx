import Redis from 'ioredis';
import type { Route } from './+types/redis';

const redis = new Redis();

export async function loader() {
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
