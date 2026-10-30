import { defineCloudflareOptions, serveTunnelIntegration } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1,
  // A meta-framework answers the tunnel requests, the Worker only drops their server spans.
  integrations: [serveTunnelIntegration()],
}));
