import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'stream',
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(_request, _env, _ctx) {
      return new Response('OK');
    },
    async scheduled(_controller, _env, _ctx) {
      await new Promise(resolve => setTimeout(resolve, 10));
    },
  } satisfies ExportedHandler<Env>,
);
