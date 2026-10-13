import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SELF: Fetcher;
  COUNTER: DurableObjectNamespace;
}

// The entrypoint itself reaches into the Durable Object. This exercises a nested
// chain — default handler → auto-wrapped `WorkerEntrypoint` → auto-wrapped
// `DurableObject` — proving a DO invoked from *inside* an auto-instrumented
// entrypoint is still instrumented. Nothing here is manually wrapped.
export class CounterEntrypoint extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/work') {
      const stub = this.env.COUNTER.get(this.env.COUNTER.idFromName('e2e'));
      return stub.fetch(new Request('https://do/increment'));
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

    if (url.pathname === '/chain') {
      // Hops into the entrypoint (which in turn hits the DO) via the self service
      // binding, so the whole auto-wrapped chain runs on one request.
      return env.SELF.fetch(new Request('https://self/work'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
