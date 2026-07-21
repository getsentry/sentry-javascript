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
      try {
        await stub.fetch(new Request('https://do/boom'));
      } catch {
        // The DO's auto-wrapped `fetch` captures the error and rethrows, so the
        // RPC call rejects. Swallow it here and resolve 200 so the outer request
        // still completes cleanly — the assertion is on the captured error.
      }
      return Response.json({ status: 'do-errored' });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
