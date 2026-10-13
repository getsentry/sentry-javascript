import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SELF: Fetcher;
}

// Neither the named entrypoint nor the default handler is manually wrapped. The
// `@sentry/cloudflare/vite` plugin's auto-instrumentation wraps both at build
// time — `GreeterEntrypoint` because it extends `WorkerEntrypoint` (and is
// self-bound in wrangler.jsonc), the default export via `withSentry`.
export class GreeterEntrypoint extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/greet') {
      return new Response('Hello from the entrypoint');
    }
    return new Response('Not found', { status: 404 });
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

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
