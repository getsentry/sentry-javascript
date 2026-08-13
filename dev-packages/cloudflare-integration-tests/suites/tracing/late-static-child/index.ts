import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1,
  }),
  {
    async fetch(_request, _env, context) {
      const lateSpan = Sentry.startInactiveSpan({
        name: 'late waitUntil child',
        op: 'test.wait_until',
      });

      context.waitUntil(
        new Promise<void>(resolve => {
          setTimeout(() => {
            lateSpan.end();
            resolve();
          }, 25);
        }),
      );

      return new Response(null, { status: 204 });
    },
  } satisfies ExportedHandler<Env>,
);
