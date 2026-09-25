import { defineCloudflareOptions } from '@sentry/cloudflare';

// `rpcTracePropagationBindings` is deliberately absent, the Vite plugin derives `COUNTER` on its own.
export default defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
  dsn: env.SENTRY_DSN,
  traceLifecycle: 'static',
  tracesSampleRate: 1.0,
}));
