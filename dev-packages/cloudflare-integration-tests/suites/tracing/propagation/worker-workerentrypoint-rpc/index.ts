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

      if (url.pathname === '/call-entrypoint') {
        const response = await env.SUB_WORKER.fetch(new Request('http://fake-host/answer'));
        const text = await response.text();
        return new Response(text);
      }

      if (url.pathname === '/call-entrypoint-greet') {
        const response = await env.SUB_WORKER.fetch(new Request('http://fake-host/greet?name=World'));
        const text = await response.text();
        return new Response(text);
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
