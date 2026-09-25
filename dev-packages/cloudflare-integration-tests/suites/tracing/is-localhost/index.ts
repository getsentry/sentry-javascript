import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  {
    async fetch(_request, _env, _ctx) {
      Sentry.startSpan({ name: 'child-span' }, () => {
        // noop
      });
      return Response.json({ status: 'ok' });
    },
  },
);
