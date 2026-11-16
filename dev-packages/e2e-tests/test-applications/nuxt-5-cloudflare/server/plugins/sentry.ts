import { definePlugin } from 'nitro';
import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

export default definePlugin(
  sentryCloudflareNitroPlugin({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/', // proxy server
  }),
);
