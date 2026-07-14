interface Env {
  SENTRY_DSN: string;
}

// A plain, unwrapped worker — no manual `Sentry.withSentry`. The
// `@sentry/cloudflare/vite` plugin's auto-instrumentation wraps the default
// export with `withSentry` at build time, sourcing options from
// `instrument.server.ts`.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/hello') {
      return Response.json({ status: 'ok' });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
