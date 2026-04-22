import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace;
  MY_QUEUE: Queue;
}

class MyDurableObjectBase extends DurableObject<Env> {
  async fetch(_request: Request) {
    return new Response('DO is fine');
  }
}

export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  MyDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/queue/send') {
        await env.MY_QUEUE.send({ action: 'test' });
        return new Response('Queued');
      }

      const id = env.MY_DURABLE_OBJECT.idFromName('test');
      const stub = env.MY_DURABLE_OBJECT.get(id);
      const response = await stub.fetch(new Request('http://fake-host/hello'));
      const text = await response.text();
      return new Response(text);
    },

    async queue(batch, env, _ctx) {
      const id = env.MY_DURABLE_OBJECT.idFromName('test');
      const stub = env.MY_DURABLE_OBJECT.get(id);
      for (const message of batch.messages) {
        await stub.fetch(new Request('http://fake-host/hello'));
        message.ack();
      }
    },

    async scheduled(controller, env, _ctx) {
      const id = env.MY_DURABLE_OBJECT.idFromName('test');
      const stub = env.MY_DURABLE_OBJECT.get(id);
      await stub.fetch(new Request('http://fake-host/hello'));
    },
  } satisfies ExportedHandler<Env>,
);
