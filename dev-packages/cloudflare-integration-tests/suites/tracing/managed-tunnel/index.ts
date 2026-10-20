import * as Sentry from '@sentry/cloudflare';
import { getTunnelPath } from '@sentry/core';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    // A meta-framework answers the tunnel requests, the Worker only drops their server spans.
    tunnel: true,
  }),
  {
    async fetch(request, env) {
      if (new URL(request.url).pathname === '/tunnel-path') {
        return new Response(getTunnelPath(env.SENTRY_DSN));
      }

      return new Response('app');
    },
  },
);
