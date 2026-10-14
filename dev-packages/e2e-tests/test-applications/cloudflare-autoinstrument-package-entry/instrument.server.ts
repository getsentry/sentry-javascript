import { defineCloudflareOptions } from '@sentry/cloudflare';

// The worker entry is a package, so the plugin reads this file from beside
// the wrangler config.
export default defineCloudflareOptions((env: { E2E_TEST_DSN: string }) => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
}));
