import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  COUNTER: DurableObjectNamespace<Counter>;
}

// Nothing is wrapped manually, the Vite plugin wraps both exports and enables RPC trace
// propagation for `COUNTER` on its own.
export class Counter extends DurableObject<Env> {
  // An uninstrumented receiver would see Sentry's RPC metadata in the trailing optional parameter,
  // see https://github.com/getsentry/sentry-javascript/issues/23233.
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
