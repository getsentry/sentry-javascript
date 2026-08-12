import { defineCloudflareOptions } from '@sentry/cloudflare';

// `enableRpcTracePropagation` is deliberately absent: the Vite plugin derives `COUNTER` from the
// wrangler config as a binding whose receiver it instruments itself, and enables it on its own.
export default defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
  dsn: env.SENTRY_DSN,
  traceLifecycle: 'static',
  tracesSampleRate: 1.0,
}));
