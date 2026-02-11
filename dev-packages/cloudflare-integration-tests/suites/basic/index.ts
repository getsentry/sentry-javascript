import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    async fetch(_request, _env, _ctx) {
      throw new Error('This is a test error from the Cloudflare integration tests');
    },
  },
);
