import type { RateLimit } from '@cloudflare/workers-types';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  MY_RATE_LIMITER: RateLimit;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/ratelimit/allowed') {
        const outcome = await env.MY_RATE_LIMITER.limit({ key: 'allowed-key' });
        return json(outcome);
      }

      if (url.pathname === '/ratelimit/blocked') {
        // The binding's limit is 1, so the second call within the period is rate limited.
        await env.MY_RATE_LIMITER.limit({ key: 'blocked-key' });
        const outcome = await env.MY_RATE_LIMITER.limit({ key: 'blocked-key' });
        return json(outcome);
      }

      return new Response('not found', { status: 404 });
    },
  } as ExportedHandler<Env>,
);
