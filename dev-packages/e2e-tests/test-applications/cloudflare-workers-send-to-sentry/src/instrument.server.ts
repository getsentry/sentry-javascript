import { defineCloudflareOptions } from '@sentry/cloudflare';

// The Sentry Vite plugin picks this file up by convention, next to the worker entry named in
// wrangler's `main`, and hands its default export to `withSentry`.
export default defineCloudflareOptions((env: Env) => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
}));
