import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  COUNTER: DurableObjectNamespace;
  SELF: Fetcher;
}

// One worker exporting three auto-instrumented shapes at once — none manually
// wrapped. The Vite plugin wraps all of them in a single build:
//   - `Counter`          → instrumentDurableObjectWithSentry (config-bound)
//   - `GreeterEntrypoint` → withSentry (structural WorkerEntrypoint detection)
//   - default export      → withSentry
export class Counter extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ count: current });
  }
}

export class GreeterEntrypoint extends WorkerEntrypoint<Env> {
  async fetch(): Promise<Response> {
    return new Response('Hello from the entrypoint');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/do') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      return stub.fetch(new Request('https://do/increment'));
    }

    if (url.pathname === '/entrypoint') {
      return env.SELF.fetch(new Request('https://self/greet'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
