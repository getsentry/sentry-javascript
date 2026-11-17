import { defineNitroPlugin } from '#imports';
import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

export default defineNitroPlugin(
  sentryCloudflareNitroPlugin({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1.0,
    enableLogs: true,
    tunnel: 'http://localhost:3031/', // proxy server
    // Several tests trigger the same server error one after another, which Dedupe would drop.
    integrations: integrations => [...integrations.filter(integration => integration.name !== 'Dedupe')],
  }),
);
