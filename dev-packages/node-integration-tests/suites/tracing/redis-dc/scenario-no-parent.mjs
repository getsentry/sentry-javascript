import * as Sentry from '@sentry/node';

async function run() {
  const { createClient } = await import('redis-5-tracing');
  const redisClient = await createClient({ socket: { host: '127.0.0.1', port: 6381 } }).connect();

  await redisClient.set('dc-no-parent:before', 'test-value');

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, () => redisClient.set('dc-no-parent:inside', 'test-value'));

  await redisClient.set('dc-no-parent:after', 'test-value');
  await redisClient.disconnect();

  // Flush every command before the parent signals that span collection is complete.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
