import * as Sentry from '@sentry/cloudflare';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObjectBase>;
}

class MyDurableObjectBase extends DurableObject<Env> {
  async computeAnswer(): Promise<number> {
    return 42;
  }
}

export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    enableRpcTracePropagation: true,
    tracesSampleRate: 1.0,
  }),
  MyDurableObjectBase,
);

class MySubWorkerEntrypointBase extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/call-do') {
      const id = (this.env as Env).MY_DURABLE_OBJECT.idFromName('test');
      const stub = (this.env as Env).MY_DURABLE_OBJECT.get(id);
      const result = await stub.computeAnswer();
      return new Response(`The answer is ${result}`);
    }

    return new Response('Not found', { status: 404 });
  }
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    rpcTracePropagationBindings: ['MY_DURABLE_OBJECT'],
  }),
  MySubWorkerEntrypointBase,
);
