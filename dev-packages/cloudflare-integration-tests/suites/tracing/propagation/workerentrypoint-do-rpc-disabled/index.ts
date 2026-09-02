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
}

export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
  }),
  MyDurableObjectBase,
);

class MyWorkerEntrypointBase extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const id = (this.env as Env).MY_DURABLE_OBJECT.idFromName('test');
    const stub = (this.env as Env).MY_DURABLE_OBJECT.get(id);

    if (url.pathname === '/rpc/hello') {
      return new Response(await stub.sayHello('World'));
    }

    // Sentinel: makes the absence of a DO transaction deterministic. It is sent after the RPC
    // call, so once it arrives everything the RPC call could have produced has arrived too.
    if (url.pathname === '/sentinel') {
      return new Response('Sentinel');
    }

    return new Response('Not found', { status: 404 });
  }
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
  }),
  MyWorkerEntrypointBase,
);
