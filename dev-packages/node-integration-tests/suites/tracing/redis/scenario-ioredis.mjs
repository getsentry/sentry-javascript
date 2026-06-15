import * as Sentry from '@sentry/node';
import Redis from 'ioredis';

const redis = new Redis({ port: 6379 });

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Span',
      op: 'test-span',
    },
    async () => {
      try {
        await redis.set('test-key', 'test-value');

        await redis.get('test-key');

        // a failing command should produce a span with an error status
        await redis.incr('test-key').catch(() => {});
      } finally {
        await redis.disconnect();
      }
    },
  );
}

run();
