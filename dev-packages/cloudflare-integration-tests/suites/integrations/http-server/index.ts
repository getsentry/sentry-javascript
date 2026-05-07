import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    async fetch(request, _env, _ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/post-json') {
        Sentry.captureMessage('POST JSON request');
        return new Response('ok');
      }

      if (url.pathname === '/post-form') {
        Sentry.captureMessage('POST form request');
        return new Response('ok');
      }

      if (url.pathname === '/post-text') {
        Sentry.captureMessage('POST text request');
        return new Response('ok');
      }

      if (url.pathname === '/post-no-body') {
        Sentry.captureMessage('POST no body request');
        return new Response('ok');
      }

      return new Response('Not found', { status: 404 });
    },
  },
);
