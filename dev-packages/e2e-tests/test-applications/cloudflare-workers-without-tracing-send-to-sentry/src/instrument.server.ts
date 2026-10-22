import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: Env) => ({
  dsn: env.E2E_TEST_DSN,
  tracesSampleRate: 0,
}));
