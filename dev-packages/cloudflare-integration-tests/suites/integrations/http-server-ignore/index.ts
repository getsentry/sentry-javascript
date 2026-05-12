import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    integrations: [
      Sentry.httpServerIntegration({
        ignoreRequestBody: url => url.includes('/health') || url.includes('/upload'),
      }),
    ],
  }),
  {
    async fetch(request, _env, _ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/health') {
        Sentry.captureMessage('Health check');
        return new Response('ok');
      }

      if (url.pathname === '/upload') {
        Sentry.captureMessage('Upload request');
        return new Response('ok');
      }

      if (url.pathname === '/api') {
        Sentry.captureMessage('API request');
        return new Response('ok');
      }

      return new Response('Not found', { status: 404 });
    },
  },
);
