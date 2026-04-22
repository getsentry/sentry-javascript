import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';
import type { RpcTarget } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObjectBase>;
}

class MyDurableObjectBase extends DurableObject<Env> implements RpcTarget {
  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }
}

// enableRpcTracePropagation is NOT enabled, so RPC methods won't be instrumented
export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    // enableRpcTracePropagation: false (default)
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

      if (url.pathname === '/rpc/hello') {
        const result = await stub.sayHello('World');
        return new Response(result);
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
