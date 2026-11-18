import { defineCloudflareOptions, serveTunnelIntegration } from '@sentry/cloudflare';

export default defineCloudflareOptions({
  dsn: 'http://public@localhost:3031/1337',
  integrations: [serveTunnelIntegration()],
  tracesSampleRate: 1,
});
