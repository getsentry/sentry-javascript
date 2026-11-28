import { defineCloudflareOptions } from '@sentry/cloudflare';

// Cloudflare only. The Sentry plugin looks for this file in the Vite root of a Void app, because the directory of
// the generated entry (`.void/`) is not in version control.
export default defineCloudflareOptions((env: { E2E_TEST_DSN: string }) => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
  transportOptions: {
    bufferSize: 1000,
  },
}));
