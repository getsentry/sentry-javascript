import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

class MyDurableObjectBase extends DurableObject<Env> {
  async fetch(request: Request) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/storage/put': {
        await this.ctx.storage.put('test-key', 'test-value');
        return new Response('Stored');
      }
      case '/storage/get': {
        const value = await this.ctx.storage.get('test-key');
        return new Response(`Got: ${value}`);
      }
      default: {
        return new Response('Not found');
      }
    }
  }
}

export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa', // dynamic sampling bias to keep transactions
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
  }),
  MyDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa', // dynamic sampling bias to keep transactions
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname.startsWith('/pass-to-object/')) {
        const id = env.MY_DURABLE_OBJECT.idFromName('foo');
        const stub = env.MY_DURABLE_OBJECT.get(id) as DurableObjectStub<MyDurableObjectBase>;
        url.pathname = url.pathname.replace('/pass-to-object/', '');
        const response = await stub.fetch(new Request(url, request));
        await new Promise(resolve => setTimeout(resolve, 500));
        return response;
      }

      return new Response('Hello World!');
    },
  } satisfies ExportedHandler<Env>,
);
