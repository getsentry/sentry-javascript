import { getTunnelPath } from '@sentry/core';
import { serveTunnelIntegration } from '@sentry/core/server';
import { wrapRequestHandler } from '@sentry/cloudflare/request';

interface Env {
  SENTRY_DSN: string;
}

export default {
  async fetch(request, env, ctx) {
    return wrapRequestHandler(
      {
        options: {
          dsn: env.SENTRY_DSN,
          // The app answers the tunnel requests itself.
          integrations: [serveTunnelIntegration({ intercept: false })],
        },
        request,
        context: ctx,
      },
      () => {
        if (new URL(request.url).pathname === '/tunnel-path') {
          return new Response(getTunnelPath(env.SENTRY_DSN));
        }

        throw new Error('The app failed to answer a tunnel request');
      },
    );
  },
} satisfies ExportedHandler<Env>;
