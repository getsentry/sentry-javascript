import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

const handler = {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext) {
    if (request.url.includes('/error')) {
      throw new Error('Test error from double-instrumented worker');
    }
    return new Response('ok');
  },
};

// Deliberately call withSentry twice on the same handler object.
// This simulates scenarios where the module is re-evaluated or the handler
// is wrapped multiple times. The SDK should handle this gracefully
// without double-wrapping (which would cause duplicate error reports).
const once = Sentry.withSentry((env: Env) => ({ dsn: env.SENTRY_DSN }), handler);
export default Sentry.withSentry((env: Env) => ({ dsn: env.SENTRY_DSN }), once);
