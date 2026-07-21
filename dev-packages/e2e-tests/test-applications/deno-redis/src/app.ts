import * as Sentry from '@sentry/deno';
import IORedis from 'ioredis';
import { createClient } from 'redis';

Sentry.init({
  environment: 'qa',
  dsn: Deno.env.get('E2E_TEST_DSN'),
  debug: !!Deno.env.get('DEBUG'),
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1,
});

const redisUrl = Deno.env.get('REDIS_URL') ?? 'redis://127.0.0.1:6379';

// One shared client per process. node-redis publishes to the
// `node-redis:command` / `:batch` / `:connect` diagnostics channels for every
// operation on this client; denoRedisIntegration is already subscribed to
// those.
const redis = createClient({ url: redisUrl });
function onRedisError(err: unknown) {
  // eslint-disable-next-line no-console
  console.error('redis client error', err);
}
redis.on('error', onRedisError);
await redis.connect();

// Separate ioredis client. ioredis >= 5.11 publishes to the `ioredis:command`
// and `ioredis:connect` channels, which denoRedisIntegration also subscribes
// to. lazyConnect so we can yield a microtick before connecting and ensure
// the DC subscriber is registered before ioredis creates its tracing channels.
await Promise.resolve();
const ioredisUrl = new URL(redisUrl);
const ioredis = new IORedis({
  host: ioredisUrl.hostname,
  port: Number(ioredisUrl.port) || 6379,
  lazyConnect: true,
});
function onIoredisError(err: unknown) {
  // eslint-disable-next-line no-console
  console.error('ioredis client error', err);
}
ioredis.on('error', onIoredisError);
await ioredis.connect();

const port = 3030;

Deno.serve({ port, hostname: '0.0.0.0' }, async (req: Request) => {
  const url = new URL(req.url);

  // node-redis: GET — exercises the command channel, success path.
  if (url.pathname === '/redis-get') {
    const key = url.searchParams.get('key') ?? 'cache:key';
    const value = await redis.get(key);
    return Response.json({ key, value });
  }

  // node-redis: SET then GET — exercises two commands inside a single
  // transaction so we can assert the parent has two db.redis children.
  if (url.pathname === '/redis-set-get') {
    const key = url.searchParams.get('key') ?? 'cache:key';
    const value = url.searchParams.get('value') ?? 'hello';
    await redis.set(key, value);
    const echoed = await redis.get(key);
    return Response.json({ key, value: echoed });
  }

  // node-redis: MULTI — exercises the batch channel.
  if (url.pathname === '/redis-multi') {
    const result = await redis.multi().set('multi:a', '1').set('multi:b', '2').get('multi:a').exec();
    return Response.json({ result });
  }

  // ioredis: GET — exercises the ioredis:command channel.
  if (url.pathname === '/ioredis-get') {
    const key = url.searchParams.get('key') ?? 'iocache:key';
    const value = await ioredis.get(key);
    return Response.json({ key, value });
  }

  // ioredis: SET then GET — two commands inside a transaction.
  if (url.pathname === '/ioredis-set-get') {
    const key = url.searchParams.get('key') ?? 'iocache:key';
    const value = url.searchParams.get('value') ?? 'hello';
    await ioredis.set(key, value);
    const echoed = await ioredis.get(key);
    return Response.json({ key, value: echoed });
  }

  // ioredis: MULTI — ioredis has no separate batch channel; per-command
  // payloads carry `batchMode`/`batchSize` instead, so we still expect one
  // db.redis span per command.
  if (url.pathname === '/ioredis-multi') {
    const result = await ioredis.multi().set('iomulti:a', '1').set('iomulti:b', '2').get('iomulti:a').exec();
    return Response.json({ result });
  }

  // ioredis: PIPELINE — same shape as MULTI from the perspective of the
  // diagnostics channel.
  if (url.pathname === '/ioredis-pipeline') {
    const result = await ioredis.pipeline().set('iopipe:a', '1').set('iopipe:b', '2').get('iopipe:a').exec();
    return Response.json({ result });
  }

  if (url.pathname === '/redis-disconnect') {
    redis.off('error', onRedisError);
    redis.close();
    ioredis.off('error', onIoredisError);
    ioredis.disconnect();
    return new Response('ok');
  }

  return new Response('Not found', { status: 404 });
});
