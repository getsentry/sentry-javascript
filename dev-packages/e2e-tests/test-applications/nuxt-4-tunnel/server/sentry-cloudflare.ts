import { defineNitroPlugin } from '#imports';
import { serveTunnelIntegration } from '@sentry/cloudflare';
import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

export default defineNitroPlugin(
  sentryCloudflareNitroPlugin({
    dsn: 'http://public@localhost:3031/1337',
    integrations: [serveTunnelIntegration()],
    tracesSampleRate: 1,
  }),
);
