import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObjectBase>;
}

class MyDurableObjectBase extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/hello') {
      return new Response('Hello, World!');
    }
    return new Response('Not found', { status: 404 });
  }
}

export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  MyDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);
      const id = env.MY_DURABLE_OBJECT.idFromName('test');
      const stub = env.MY_DURABLE_OBJECT.get(id);

      if (url.pathname === '/do/hello') {
        // Call DO via fetch instead of RPC
        const doResponse = await stub.fetch(new Request('http://do/hello'));
        const text = await doResponse.text();
        return new Response(text);
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
