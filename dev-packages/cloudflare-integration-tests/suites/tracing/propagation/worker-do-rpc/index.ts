import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObjectBase>;
}

class MyDurableObjectBase extends DurableObject<Env> {
  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }

  async multiply(a: number, b: number): Promise<number> {
    return a * b;
  }
}

export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
  }),
  MyDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
    rpcTracePropagationBindings: ['MY_DURABLE_OBJECT'],
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

      if (url.pathname === '/rpc/multiply') {
        const result = await stub.multiply(6, 7);
        return new Response(String(result));
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
