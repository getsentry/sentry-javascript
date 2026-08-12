import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObjectBase>;
}

class MyDurableObjectBase extends DurableObject<Env> {
  #name: string | undefined;

  setName(name: string): string {
    this.#name = name;
    return this.#name;
  }

  bootstrap(name: string): string {
    // Regression for #23040 — native Durable Object RPC (facets, the Agents SDK bootstrap
    // calling PartyServer's `setName()`) resolves the method on the prototype and invokes it
    // with the stored Durable Object instance as the receiver. When the instrumented
    // constructor returned a Proxy of the instance, native private field access failed:
    // "TypeError: Cannot read private member #name from an object whose class did not declare
    // it" — a Proxy never carries the target's private-field brand.
    //
    // Construct a fresh instrumented instance exactly as the runtime does (the raw
    // DurableObjectState sits below the instrumented context's prototype), then dispatch the
    // way native RPC does: prototype method, stored instance as receiver.
    const rawCtx = Object.getPrototypeOf(this.ctx) as DurableObjectState;
    const instance = new MyDurableObject(rawCtx, this.env);
    const prototype = Object.getPrototypeOf(instance) as MyDurableObjectBase;
    return prototype.setName.call(instance, name);
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
    rpcTracePropagationTargets: ['MY_DURABLE_OBJECT'],
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/prototype-dispatch') {
        const id = env.MY_DURABLE_OBJECT.idFromName('test');
        const stub = env.MY_DURABLE_OBJECT.get(id);
        const name = await stub.bootstrap('agent-1');
        return new Response(name);
      }

      if (url.pathname === '/rpc/set-name') {
        const id = env.MY_DURABLE_OBJECT.idFromName('test');
        const stub = env.MY_DURABLE_OBJECT.get(id);
        const name = await stub.setName('agent-2');
        return new Response(name);
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
