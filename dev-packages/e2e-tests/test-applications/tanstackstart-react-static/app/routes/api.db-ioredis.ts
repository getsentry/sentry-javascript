import { createFileRoute } from '@tanstack/react-router';
import Redis from 'ioredis';

export const Route = createFileRoute('/api/db-ioredis')({
  server: {
    handlers: {
      GET: async () => {
        const redis = new Redis({
          // Don't keep retrying forever if Redis goes away (e.g. on test teardown)
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        });

        try {
          await redis.set('test-key', 'test-value');
          const value = await redis.get('test-key');
          return Response.json({ value });
        } finally {
          redis.disconnect();
        }
      },
    },
  },
});
