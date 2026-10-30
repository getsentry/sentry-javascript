import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

const handler: ExportedHandler<Env> = Sentry.withSentry((env: Env) => ({ dsn: env.SENTRY_DSN }), {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/dsn') {
      return new Response(env.SENTRY_DSN);
    }
    if (pathname === '/done') {
      Sentry.captureMessage('done');
      return new Response('done');
    }

    return (await Sentry.handleTunnelRequestIfMatched(request)) ?? new Response('app');
  },
});

export default {
  async fetch(request, env, ctx) {
    // There's no client before `withSentry`, so the tunnel has to be named.
    const tunnelResponse = Sentry.handleTunnelRequestIfMatched(request, {
      allowedDsns: [env.SENTRY_DSN],
      basePath: '/outside',
    });

    return tunnelResponse ?? handler.fetch!(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
