import { defineCloudflareOptions } from '@sentry/cloudflare';

// The Sentry Nuxt module wraps the Worker with `withSentry` and these options on Cloudflare. Node, Bun and Deno use
// `sentry.server.config.ts`.
export default defineCloudflareOptions({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
  enableLogs: true,
  // Several tests trigger the same server error one after another, which Dedupe would drop.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});
