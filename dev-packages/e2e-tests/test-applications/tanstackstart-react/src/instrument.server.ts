import { defineCloudflareOptions } from '@sentry/cloudflare';

// Only the Cloudflare build reads this file: `sentryCloudflareVitePlugin` wraps the Worker entry next to it with
// `withSentry` and these options.
export default defineCloudflareOptions({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1,
});
