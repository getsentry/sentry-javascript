import * as Sentry from '@sentry/node';

async function run() {
  const { default: Redis } = await import('ioredis-6');
  const redisClient = new Redis({ host: '127.0.0.1', port: 6382, lazyConnect: true });

  await redisClient.connect();
  await redisClient.set('dc-no-parent:before', 'test-value');

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, () => redisClient.set('dc-no-parent:inside', 'test-value'));

  await redisClient.set('dc-no-parent:after', 'test-value');
  await redisClient.disconnect();

  // Flush before ending the parent, so a span without a parent would arrive before the parent does.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
