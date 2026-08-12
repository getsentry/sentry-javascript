import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  COUNTER: DurableObjectNamespace<Counter>;
}

// Neither the Durable Object nor the default handler is manually wrapped — the
// `@sentry/cloudflare/vite` plugin wraps both at build time, and enables RPC trace propagation for
// the `COUNTER` binding because the receiver it points at is this very class.
export class Counter extends DurableObject<Env> {
  // The trailing optional parameter is where an uninstrumented receiver would see Sentry's RPC
  // metadata object — see https://github.com/getsentry/sentry-javascript/issues/23233.
  async increment(by: number, _unused?: number): Promise<{ count: number; argumentCount: number }> {
    const count = ((await this.ctx.storage.get<number>('count')) ?? 0) + by;
    await this.ctx.storage.put('count', count);
    return { count, argumentCount: arguments.length };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/increment') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      return Response.json(await stub.increment(1));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
