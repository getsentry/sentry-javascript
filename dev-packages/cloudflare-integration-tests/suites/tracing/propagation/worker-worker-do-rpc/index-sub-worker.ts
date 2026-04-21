import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';
import type { RpcTarget } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObjectBase>;
}

class MyDurableObjectBase extends DurableObject<Env> implements RpcTarget {
  async computeAnswer(): Promise<number> {
    return 42;
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

      if (url.pathname === '/call-do') {
        const id = env.MY_DURABLE_OBJECT.idFromName('test');
        const stub = env.MY_DURABLE_OBJECT.get(id);
        const result = await stub.computeAnswer();
        return new Response(`The answer is ${result}`);
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
