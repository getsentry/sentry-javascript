import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace;
}

class TestDurableObjectBase extends DurableObject<Env> {
  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}`;
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  TestDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    rpcTracePropagationBindings: ['TEST_DURABLE_OBJECT'],
  }),
  {
    async fetch(request: Request, env: Env): Promise<Response> {
      const { pathname } = new URL(request.url);

      // `import.meta.resolve` only exists with the new module registry.
      if (pathname === '/import-meta-resolve') {
        return new Response(typeof import.meta.resolve);
      }

      if (pathname === '/error') {
        throw new Error('Error with the new module registry');
      }

      if (pathname === '/durable-object') {
        const stub = env.TEST_DURABLE_OBJECT.get(
          env.TEST_DURABLE_OBJECT.idFromName('test'),
        ) as unknown as TestDurableObjectBase;
        return new Response(await stub.sayHello('world'));
      }

      Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {});
      return new Response('OK');
    },
  } satisfies ExportedHandler<Env>,
);
