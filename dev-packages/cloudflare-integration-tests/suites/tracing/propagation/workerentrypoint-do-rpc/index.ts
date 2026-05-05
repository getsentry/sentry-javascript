import * as Sentry from '@sentry/cloudflare';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

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
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  MyDurableObjectBase,
);

class MyWorkerEntrypointBase extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const id = this.env.MY_DURABLE_OBJECT.idFromName('test');
    const stub = this.env.MY_DURABLE_OBJECT.get(id);

    if (url.pathname === '/rpc/hello') {
      const result = await stub.sayHello('World');
      return new Response(result);
    }

    if (url.pathname === '/rpc/multiply') {
      const result = await stub.multiply(6, 7);
      return new Response(String(result));
    }

    return new Response('Not found', { status: 404 });
  }
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  MyWorkerEntrypointBase,
);
