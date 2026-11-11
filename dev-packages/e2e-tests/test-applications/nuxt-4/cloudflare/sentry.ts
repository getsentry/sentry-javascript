import { defineNitroPlugin } from '#imports';
import { serveTunnelIntegration } from '@sentry/cloudflare';
import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

declare const __E2E_TEST_TUNNEL__: boolean;

export default defineNitroPlugin(
  sentryCloudflareNitroPlugin({
    dsn: __E2E_TEST_TUNNEL__ ? 'http://public@localhost:3031/1337' : 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1.0,
    enableLogs: true,
    tunnel: 'http://localhost:3031/', // proxy server
    // Several tests trigger the same server error one after another, which Dedupe would drop.
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'Dedupe'),
      ...(__E2E_TEST_TUNNEL__ ? [serveTunnelIntegration()] : []),
    ],
  }),
);
