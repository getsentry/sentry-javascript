interface Env {
  SERVER_URL: string;
}

// A plain worker. The `@sentry/cloudflare/vite` plugin wraps it with `withSentry` at build time,
// with the options from `instrument.server.ts`.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    await fetch(`${env.SERVER_URL}/outgoing`);

    if (new URL(request.url).pathname === '/error') {
      throw new Error('Test error');
    }

    return Response.json({ status: 'ok' });
  },
};
