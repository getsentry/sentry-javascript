import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace;
  ANOTHER_WORKER: Fetcher;
}

class MyDurableObjectBase extends DurableObject<Env> {
  async fetch(request: Request) {
    return new Response('DO is fine');
  }
}

export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  MyDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env) {
      const response = await env.ANOTHER_WORKER.fetch(new Request('http://fake-host/hello'));
      const text = await response.text();
      return new Response(text);
    },
  } satisfies ExportedHandler<Env>,
);
