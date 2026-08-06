import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(_request, _env, _ctx) {
      return new Response('OK');
    },
    async scheduled(controller, _env, _ctx) {
      if (controller.cron === '0 0 * * *') {
        throw new Error('Test error from scheduled handler');
      }

      // Successful scheduled handler - just does some work
      await new Promise(resolve => setTimeout(resolve, 10));
    },
  } satisfies ExportedHandler<Env>,
);
