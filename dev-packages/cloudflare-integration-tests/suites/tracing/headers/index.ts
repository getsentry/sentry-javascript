import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  SERVER_URL: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    propagateTraceparent: true,
  }),
  {
    async fetch(_request, env, _ctx) {
      await fetch(env.SERVER_URL);
      throw new Error('Test error to capture trace headers');
    },
  },
);
