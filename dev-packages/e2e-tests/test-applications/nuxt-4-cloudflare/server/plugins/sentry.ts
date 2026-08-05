import { defineNitroPlugin } from '#imports';
import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

export default defineNitroPlugin(
  sentryCloudflareNitroPlugin({
    traceLifecycle: 'static',
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/', // proxy server
  }),
);
