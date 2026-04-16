import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  ANOTHER_WORKER: Fetcher;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  {
    async fetch(request, env) {
      const response = await env.ANOTHER_WORKER.fetch(new Request('http://fake-host/hello'));
      const text = await response.text();
      return new Response(text);
    },
  } satisfies ExportedHandler<Env>,
);
