import type { MessageBatch, Queue } from '@cloudflare/workers-types';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  MY_QUEUE: Queue<{ trigger?: 'error'; payload?: string }>;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/enqueue/error') {
        await env.MY_QUEUE.send({ trigger: 'error' });
        return new Response('enqueued error');
      }

      if (url.pathname === '/enqueue/ok') {
        await env.MY_QUEUE.send({ payload: 'hello' });
        return new Response('enqueued ok');
      }

      if (url.pathname === '/enqueue/batch') {
        await env.MY_QUEUE.sendBatch([
          { body: { payload: 'one' } },
          { body: { payload: 'two' } },
          { body: { payload: 'three' } },
        ]);
        return new Response('enqueued batch');
      }

      return new Response('not found', { status: 404 });
    },
    async queue(batch: MessageBatch<{ trigger?: 'error'; payload?: string }>) {
      for (const message of batch.messages) {
        if (message.body.trigger === 'error') {
          throw new Error('Boom from queue handler');
        }
      }
    },
  },
);
