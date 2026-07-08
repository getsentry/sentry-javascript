import type { RateLimit } from '@cloudflare/workers-types';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  MY_RATE_LIMITER: RateLimit;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/ratelimit/limit') {
        const outcome = await env.MY_RATE_LIMITER.limit({ key: 'test-key' });
        return new Response(JSON.stringify(outcome));
      }

      return new Response('not found', { status: 404 });
    },
  } as ExportedHandler<Env>,
);
