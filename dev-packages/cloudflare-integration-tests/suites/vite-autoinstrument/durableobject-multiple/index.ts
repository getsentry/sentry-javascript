import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  COUNTER_A: DurableObjectNamespace;
  COUNTER_B: DurableObjectNamespace;
}

// Two Durable Object classes are configured in wrangler and both exported
// inline. The auto-instrument transform must wrap each of them — not just the
// first match.
export class CounterA extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ counter: 'a', count: current });
  }
}

export class CounterB extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ counter: 'b', count: current });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/increment-a') {
      const stub = env.COUNTER_A.get(env.COUNTER_A.idFromName('e2e-a'));
      return stub.fetch(new Request('https://do/increment'));
    }

    if (url.pathname === '/increment-b') {
      const stub = env.COUNTER_B.get(env.COUNTER_B.idFromName('e2e-b'));
      return stub.fetch(new Request('https://do/increment'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
