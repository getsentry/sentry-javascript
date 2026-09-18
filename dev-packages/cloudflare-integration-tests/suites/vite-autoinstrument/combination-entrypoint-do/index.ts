import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SELF: Fetcher;
  COUNTER: DurableObjectNamespace;
}

// A single worker exporting both a plain `WorkerEntrypoint` and a plain
// `DurableObject` alongside a plain default handler — none manually wrapped. The
// `@sentry/cloudflare/vite` plugin's auto-instrumentation must wrap all three at
// build time: `GreeterEntrypoint` (self-bound in wrangler.jsonc), `Counter` via
// `instrumentDurableObjectWithSentry`, and the default export via `withSentry`.
export class GreeterEntrypoint extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/greet') {
      return new Response('Hello from the entrypoint');
    }
    return new Response('Not found', { status: 404 });
  }
}

export class Counter extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ count: current });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/call-entrypoint') {
      // Loops back into this worker's own `GreeterEntrypoint` via the self
      // service binding, so the auto-wrapped entrypoint actually runs.
      return env.SELF.fetch(new Request('https://self/greet'));
    }

    if (url.pathname === '/increment') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      return stub.fetch(new Request('https://do/increment'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
