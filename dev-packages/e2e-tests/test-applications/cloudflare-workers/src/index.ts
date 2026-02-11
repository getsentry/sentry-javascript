/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

class MyDurableObjectBase extends DurableObject<Env> {
  private throwOnExit = new WeakMap<WebSocket, Error>();
  async throwException(): Promise<void> {
    throw new Error('Should be recorded in Sentry.');
  }

  async fetch(request: Request) {
    const { pathname } = new URL(request.url);
    switch (pathname) {
      case '/throwException': {
        await this.throwException();
        break;
      }
      case '/ws':
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);
        this.ctx.acceptWebSocket(server);
        return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('DO is fine');
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void | Promise<void> {
    if (message === 'throwException') {
      throw new Error('Should be recorded in Sentry: webSocketMessage');
    } else if (message === 'throwOnExit') {
      this.throwOnExit.set(ws, new Error('Should be recorded in Sentry: webSocketClose'));
    }
  }

  webSocketClose(ws: WebSocket): void | Promise<void> {
    if (this.throwOnExit.has(ws)) {
      const error = this.throwOnExit.get(ws)!;
      this.throwOnExit.delete(ws);
      throw error;
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
    transportOptions: {
      // We are doing a lot of events at once in this test
      bufferSize: 1000,
    },
    instrumentPrototypeMethods: true,
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
    transportOptions: {
      // We are doing a lot of events at once in this test
      bufferSize: 1000,
    },
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);
      switch (url.pathname) {
        case '/rpc/throwException':
          {
            const id = env.MY_DURABLE_OBJECT.idFromName('foo');
            const stub = env.MY_DURABLE_OBJECT.get(id) as DurableObjectStub<MyDurableObjectBase>;
            try {
              await stub.throwException();
            } catch (e) {
              //We will catch this to be sure not to log inside withSentry
              return new Response(null, { status: 500 });
            }
          }
          break;
        case '/throwException':
          throw new Error('To be recorded in Sentry.');
        default:
          if (url.pathname.startsWith('/pass-to-object/')) {
            const id = env.MY_DURABLE_OBJECT.idFromName('foo');
            const stub = env.MY_DURABLE_OBJECT.get(id) as DurableObjectStub<MyDurableObjectBase>;
            url.pathname = url.pathname.replace('/pass-to-object/', '');
            return stub.fetch(new Request(url, request));
          }
      }
      return new Response('Hello World!');
    },
  } satisfies ExportedHandler<Env>,
);
