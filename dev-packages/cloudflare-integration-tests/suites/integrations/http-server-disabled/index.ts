import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    integrations: [Sentry.httpServerIntegration({ maxRequestBodySize: 'none' })],
  }),
  {
    async fetch(_request, _env, _ctx) {
      Sentry.captureMessage('POST with disabled body capture');
      return new Response('ok');
    },
  },
);
