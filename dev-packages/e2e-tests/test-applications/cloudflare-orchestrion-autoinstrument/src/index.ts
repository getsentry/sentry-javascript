import { DurableObject } from 'cloudflare:workers';

// Neither the Durable Object nor the default export is manually wrapped with
// Sentry. The `@sentry/cloudflare/vite` plugin's `autoInstrumentation` option
// wraps both at build time (the DO via `instrumentDurableObjectWithSentry`, the
// default export via `withSentry`), sourcing options from `instrument.server.ts`.

export class Counter extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/boom') {
      throw new Error('Durable Object failure captured by Sentry');
    }

    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ count: current });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/test-worker-transaction') {
      return Response.json({ status: 'ok' });
    }

    if (url.pathname === '/test-do-transaction') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      return stub.fetch(new Request('https://do/increment'));
    }

    if (url.pathname === '/test-do-error') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      const res = await stub.fetch(new Request('https://do/boom'));
      // The DO's fetch throws; its auto-wrapped handler captures the error and
      // returns a 500. Normalize to 200 so the outer request still resolves
      // cleanly for the test.
      return Response.json({ status: res.ok ? 'ok' : 'do-errored' });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
