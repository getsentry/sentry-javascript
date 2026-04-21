import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  SUB_WORKER: Fetcher;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/chain') {
        const response = await env.SUB_WORKER.fetch(new Request('http://fake-host/call-do'));
        const text = await response.text();
        return new Response(text);
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
