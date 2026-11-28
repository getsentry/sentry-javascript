import { defineCloudflareOptions } from '@sentry/cloudflare';

// Only the Cloudflare build reads this file: `sentryCloudflareVitePlugin` wraps the Worker entry next to it with
// `withSentry` and these options. On the other runtimes, the Nitro build loads `instrument.server.mjs` in the app root.
export default defineCloudflareOptions((env: { E2E_TEST_DSN?: string }) => ({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1,
}));
