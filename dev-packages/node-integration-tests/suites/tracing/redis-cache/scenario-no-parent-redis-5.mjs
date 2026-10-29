import * as Sentry from '@sentry/node';
import { createClient } from 'redis-5';

async function run() {
  const redisClient = await createClient({ socket: { port: 6383 } }).connect();

  await redisClient.set('redis-5-no-parent:before', 'test-value');
  await redisClient.multi().set('redis-5-no-parent:multi-before', 'test-value').exec();

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, async () => {
    await redisClient.set('redis-5-no-parent:inside', 'test-value');
    await redisClient.multi().set('redis-5-no-parent:multi-inside', 'test-value').exec();
  });

  await redisClient.set('redis-5-no-parent:after', 'test-value');
  await redisClient.disconnect();

  // Flush before ending the parent, so a span without a parent would arrive before the parent does.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
