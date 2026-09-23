import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObjectBase>;
  SVC_ALPHA: DurableObjectNamespace<MyDurableObjectBase>;
  SVC_BETA: DurableObjectNamespace<MyDurableObjectBase>;
}

class MyDurableObjectBase extends DurableObject<Env> {
  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }

  async alpha(): Promise<string> {
    return 'alpha';
  }

  async beta(): Promise<string> {
    return 'beta';
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
    // Both targets are written in a casing the bindings do not use, and the regex carries the `g`
    // flag, which makes `test()` stateful unless the SDK normalizes it away.
    rpcTracePropagationBindings: ['my_durable_object', /^svc_/g],
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/rpc/all') {
        const results = [
          await env.MY_DURABLE_OBJECT.get(env.MY_DURABLE_OBJECT.idFromName('test')).sayHello('World'),
          await env.SVC_ALPHA.get(env.SVC_ALPHA.idFromName('test')).alpha(),
          await env.SVC_BETA.get(env.SVC_BETA.idFromName('test')).beta(),
        ];

        return new Response(results.join(','));
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
