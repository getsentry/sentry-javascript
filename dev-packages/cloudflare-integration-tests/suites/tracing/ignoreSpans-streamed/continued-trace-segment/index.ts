import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  SERVER_URL: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0,
    traceLifecycle: 'stream',
    ignoreSpans: [{ op: 'http.server' }],
    tracePropagationTargets: [env.SERVER_URL],
  }),
  {
    async fetch(_request, env, _ctx) {
      await fetch(`${env.SERVER_URL}/outgoing`);
      return Response.json({ status: 'ok' });
    },
  },
);
