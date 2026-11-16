import { serveTunnelIntegration } from '@sentry/cloudflare';
import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';
import { definePlugin } from 'nitro';

export default definePlugin(
  sentryCloudflareNitroPlugin({
    dsn: 'http://public@localhost:3031/1337',
    integrations: [serveTunnelIntegration()],
    tracesSampleRate: 1,
  }),
);
