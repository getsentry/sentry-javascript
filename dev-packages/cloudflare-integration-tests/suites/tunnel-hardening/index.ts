import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  ALLOWED_DSNS: string;
  TUNNEL_PATH: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    integrations: [Sentry.serveTunnelIntegration({ allowedDsns: env.ALLOWED_DSNS.split(',') })],
  }),
  {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      if (pathname === '/health') {
        return new Response('ok');
      }
      if (pathname === '/done') {
        Sentry.captureMessage('done');
        return new Response('done');
      }
      // The app's own handler on the tunnel path, which the runtime answers before it.
      if (pathname === env.TUNNEL_PATH) {
        return new Response('app tunnel handler', { status: 418 });
      }

      return new Response('not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
