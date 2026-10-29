import * as Sentry from '@sentry/node';

async function run() {
  const { createClient } = await import('redis-5-tracing');
  const redisClient = await createClient({ socket: { host: '127.0.0.1', port: 6381 } }).connect();

  await redisClient.set('dc-no-parent:before', 'test-value');
  await redisClient.multi().set('dc-no-parent:multi-before', 'test-value').exec();

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, async () => {
    await redisClient.set('dc-no-parent:inside', 'test-value');
    await redisClient.multi().set('dc-no-parent:multi-inside', 'test-value').exec();
  });

  await redisClient.set('dc-no-parent:after', 'test-value');
  await redisClient.disconnect();

  // Flush before ending the parent, so a span without a parent would arrive before the parent does.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
