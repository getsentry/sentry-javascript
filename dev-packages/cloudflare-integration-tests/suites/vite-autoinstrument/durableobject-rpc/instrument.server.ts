import { defineCloudflareOptions } from '@sentry/cloudflare';

// `rpcTracePropagationBindings` is deliberately absent, the Vite plugin derives `COUNTER` on its own.
export default defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
}));
