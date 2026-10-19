import { defineNitroPlugin } from '#imports';
import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

declare const __E2E_TEST_TUNNEL__: boolean;

export default defineNitroPlugin(
  sentryCloudflareNitroPlugin({
    // The tunnel forwards to the DSN host, which is the event proxy in the tunnel variant.
    dsn: __E2E_TEST_TUNNEL__ ? 'http://public@localhost:3031/1337' : 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1.0,
    tunnel: __E2E_TEST_TUNNEL__ ? true : 'http://localhost:3031/', // proxy server
  }),
);
