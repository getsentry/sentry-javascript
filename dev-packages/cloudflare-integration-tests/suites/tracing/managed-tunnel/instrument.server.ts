import { defineCloudflareOptions, serveTunnelIntegration } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1,
  integrations: [serveTunnelIntegration()],
}));
