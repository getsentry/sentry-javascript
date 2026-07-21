import { AdminEntrypointBase } from './base';

interface Env {
  SENTRY_DSN: string;
  SELF: Fetcher;
}

// A named WorkerEntrypoint whose base class lives in another module, plus a
// default `ExportedHandler` — neither manually wrapped. The Vite plugin wraps
// the default export via `withSentry`, and wraps `AdminEntrypoint` via the
// config self-binding (structural detection is blind to the imported base).
export class AdminEntrypoint extends AdminEntrypointBase<Env> {
  async fetch(): Promise<Response> {
    return new Response('Hello from the admin entrypoint');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/call-entrypoint') {
      return env.SELF.fetch(new Request('https://self/admin'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
