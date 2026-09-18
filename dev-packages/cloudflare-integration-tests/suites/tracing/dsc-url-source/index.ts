import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// Tracing is enabled (not TwP), but the route is a raw, non-parametrized URL so the
// http.server span source is `url`. The span name must therefore be omitted from the
// DSC (raw URLs may contain PII), even though a real transaction is recorded.
export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(_request, _env, _ctx) {
      throw new Error('Test error from URL-source worker');
    },
  },
);
