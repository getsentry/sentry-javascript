import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    integrations: integrations => integrations.filter(i => i.name !== 'HttpServer'),
  }),
  {
    async fetch(_request, _env, _ctx) {
      Sentry.captureMessage('POST with filtered integration');
      return new Response('ok');
    },
  },
);
