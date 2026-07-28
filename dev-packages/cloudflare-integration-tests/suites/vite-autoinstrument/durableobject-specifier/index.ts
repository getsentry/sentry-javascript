import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  COUNTER: DurableObjectNamespace;
}

// The Durable Object is declared as a plain class and exported through a
// specifier list (`export { Counter }`) rather than inline. The
// `@sentry/cloudflare/vite` plugin's auto-instrumentation renames the class and
// rebinds the exported name to the wrapped class at build time.
class Counter extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ count: current });
  }
}

export { Counter };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/increment') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      return stub.fetch(new Request('https://do/increment'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
