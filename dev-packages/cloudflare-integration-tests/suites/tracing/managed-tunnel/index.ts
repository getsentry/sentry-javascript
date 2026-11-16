import { getTunnelPath } from '@sentry/core';

interface Env {
  SENTRY_DSN: string;
}

// A plain worker. The `@sentry/cloudflare/vite` plugin wraps it with `withSentry` at build time,
// with the options from `instrument.server.ts`.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/tunnel-path') {
      return new Response(getTunnelPath(env.SENTRY_DSN));
    }

    return new Response('app');
  },
};
