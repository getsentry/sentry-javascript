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
import { DurableObject } from "cloudflare:workers";

class MyDurableObjectBase extends DurableObject<Env> {
  async throwException(): Promise<string> {
    throw new Error("Should be recorded in Sentry.")
  }

  async fetch(request: Request){
    const {pathname} = new URL(request.url)
    if(pathname === '/throwException'){
      await this.throwException()
    }
    return new Response('DO is fine')
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
