import * as Sentry from '@sentry/cloudflare';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SELF: Fetcher;
  COUNTER: DurableObjectNamespace;
}

// The WorkerEntrypoint is left plain — the auto-instrument transform must wrap
// it (and the default export) at build time.
export class GreeterEntrypoint extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/greet') {
      return new Response('Hello from the entrypoint');
    }
    return new Response('Not found', { status: 404 });
  }
}

class CounterImpl extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ count: current });
  }
}

// The Durable Object is already wrapped manually. The transform must detect the
// existing `Sentry.instrumentDurableObjectWithSentry` call and leave it
// untouched (no double-wrap) while still auto-wrapping the plain entrypoint and
// default export in the same file.
export const Counter = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 1.0 }),
  CounterImpl,
);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/call-entrypoint') {
      return env.SELF.fetch(new Request('https://self/greet'));
    }

    if (url.pathname === '/increment') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      return stub.fetch(new Request('https://do/increment'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
