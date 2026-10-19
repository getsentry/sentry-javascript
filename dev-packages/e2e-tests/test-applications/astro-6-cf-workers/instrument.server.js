import { defineCloudflareOptions } from '@sentry/cloudflare';

export default defineCloudflareOptions(env => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: import.meta.env.PUBLIC_E2E_TEST_TUNNEL ? true : 'http://localhost:3031/', // proxy server
  debug: true,
}));
