import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
  dsn: env.SENTRY_DSN,
  traceLifecycle: 'static',
  tracesSampleRate: 1.0,
}));
