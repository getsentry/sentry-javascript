import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    integrations: [Sentry.httpServerIntegration({ maxRequestBodySize: 'small' })],
  }),
  {
    async fetch(request, _env, _ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/small-body') {
        Sentry.captureMessage('Small body request');
        return new Response('ok');
      }

      if (url.pathname === '/large-body') {
        Sentry.captureMessage('Large body request');
        return new Response('ok');
      }

      return new Response('Not found', { status: 404 });
    },
  },
);
