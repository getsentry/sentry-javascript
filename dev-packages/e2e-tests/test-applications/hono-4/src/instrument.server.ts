import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions<{ E2E_TEST_DSN: string }>(env => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
}));
